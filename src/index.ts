import {chromium, Page, Browser} from "playwright";
import * as fs from "fs";
import * as path from "path";

class PlaywrightCrawler {
  private visitedUrls: Set<string> = new Set();
  private outputDir: string = "output";
  private pageCount: number = 0;
  private browser: Browser | null = null;

  constructor() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir);
    }
  }

  async crawl(startUrl: string, maxPages: number = 10) {
    this.browser = await chromium.launch();
    const page = await this.browser.newPage();
    const baseUrl = new URL(startUrl).origin;

    await this.crawlPage(page, startUrl, baseUrl, maxPages);

    await this.browser.close();

    console.log(`Crawling completed. Total pages collected: ${this.pageCount}`);
  }

  private async crawlPage(
    page: Page,
    url: string,
    baseUrl: string,
    maxPages: number
  ) {
    if (this.visitedUrls.size >= maxPages || this.visitedUrls.has(url)) {
      return;
    }

    console.log(`Crawling: ${url}`);
    this.visitedUrls.add(url);

    try {
      await page.goto(url, {waitUntil: "networkidle"});

      // Wait for client-side navigation to complete
      await page.waitForLoadState("networkidle");

      const content = await this.extractContent(page);
      await this.saveToFile(url, content);

      const links = await this.discoverLinks(page, baseUrl);
      console.log(`Discovered ${links.length} links on ${url}`);

      for (const link of links) {
        if (this.visitedUrls.size < maxPages) {
          // For SPAs, we navigate within the same page instead of creating a new one
          await this.crawlPage(page, link, baseUrl, maxPages);
        } else {
          break;
        }
      }
    } catch (error) {
      console.error(`Failed to crawl ${url}: ${error}`);
    }
  }

  private async discoverLinks(page: Page, baseUrl: string): Promise<string[]> {
    return page.evaluate((baseUrl) => {
      const links = new Set<string>();
      document.querySelectorAll("a").forEach((el) => {
        let href = el.getAttribute("href");
        if (href && !href.startsWith("http") && !href.startsWith("#")) {
          href = new URL(href, baseUrl).href;
        }
        if (href && href.startsWith(baseUrl)) {
          links.add(href);
        }
      });
      return Array.from(links);
    }, baseUrl);
  }

  private async extractContent(page: Page): Promise<string> {
    return page.evaluate(() => {
      // Attempt to find and remove the header
      const header = document.querySelector("header");
      if (header && header.parentNode) {
        header.parentNode.removeChild(header);
      }

      const selectors = ["main", "#__next > div", "#__next", "body"];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          return element.textContent;
        }
      }
      return document.body.textContent || "";
    });
  }

  private async saveToFile(url: string, content: string) {
    const fileName = this.urlToFileName(url);
    const filePath = path.join(this.outputDir, fileName);
    const fileContent = `URL: ${url}\n\nContent:\n${content.trim()}`;
    try {
      await fs.promises.writeFile(filePath, fileContent);
      console.log(`Saved content to ${filePath}`);
      this.pageCount++;
    } catch (error) {
      console.error(`Failed to save content for ${url}: ${error}`);
    }
  }

  private urlToFileName(url: string): string {
    return (
      url
        .replace(/^https?:\/\//, "")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .toLowerCase() + ".txt"
    );
  }
}

// Usage
(async () => {
  const crawler = new PlaywrightCrawler();
  await crawler.crawl("https://nextjs.org", 200);
})();
