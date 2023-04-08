const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const request = require('request-promise-native');
const cheerio = require('cheerio');
const chalk = require('chalk');

const baseUrl = 'https://sqli.cloud';
const totalPages = 5; // Set this to the number of pages you want to scrape
const uniqueLinks = new Set();

async function scrapeLinks(offset) {
  console.log(chalk.yellow(`[STATUS] Scraping links from offset ${ offset }`));

  try {
    const url = `${baseUrl}/api/discussions?filter[tag]=combolists&sort=&page[offset]=${ offset }`;
    const response = await request.get(url);
    const jsonResponse = JSON.parse(response);
    const data = jsonResponse.data;

    for (const item of data) {
      const slug = item.attributes.slug;
      const link = `${ baseUrl }/d/${ slug }`;
      uniqueLinks.add(link);
      console.log(chalk.gray(`[INFO] Found link: ${ link }`));
    }

    return data.length;
  } catch (error) {
    console.error(chalk.red(`[ERROR] Error fetching URL: ${ error.message }`));
    return 0;
  }
}

async function crawlPages() {
  console.clear();

  for (let i = 1; i <= totalPages; i++) {
    const offset = (i - 1) * 20;
    const linksCount = await scrapeLinks(offset);

    if (linksCount === 0) {
      break;
    }
  }

  fs.writeFileSync('links.txt', Array.from(uniqueLinks).join('\n') + '\n');
  console.log(chalk.green(`[SUCCESS] Scraped ${ uniqueLinks.size } unique links from ${ totalPages } pages`));

  crawlAndDownloadLinks();
}

async function crawlAndDownloadLinks() {
  console.clear();
  console.log(chalk.yellow('[STATUS] Crawling and downloading text files'));

  try {
    const links = fs.readFileSync('links.txt', 'utf-8').split('\n');

    for (const link of links) {
      if (link.startsWith('http')) {
        const browser = await puppeteer.launch();
        const pageInstance = await browser.newPage();
        console.log(chalk.yellow(`\n[STATUS] Waiting for page to load: ${ link }`));
        await pageInstance.goto(link, {waitUntil: 'networkidle0'});
        const html = await pageInstance.content();

        const $ = cheerio.load(html);
        const uploadEeLink = $('a[href*="upload.ee"]').attr('href');

        if (uploadEeLink) {
          console.log(chalk.gray(`[INFO] Found link: ${ uploadEeLink }`));
          console.log(chalk.yellow(`[STATUS] Waiting for page to load: ${ uploadEeLink }`));
          await pageInstance.goto(uploadEeLink, {waitUntil: 'networkidle0'});
          const uploadEeHtml = await pageInstance.content();
          const uploadEe$ = cheerio.load(uploadEeHtml);
          const directDownloadLink = uploadEe$('a[href*="upload.ee/download"]').attr('href');

          if (directDownloadLink) {
            console.log(chalk.gray(`[INFO] Found direct download link: ${ directDownloadLink }`));
            const fileName = path.basename(directDownloadLink).split('/').pop();
            const outputPath = path.join('combos', fileName);
            await downloadFile(directDownloadLink, outputPath);
          } else {
            console.log(chalk.red(`[WARNING] Direct download link not found for: ${ uploadEeLink }`));
          }
        } else {
          console.log(chalk.red(`[WARNING] upload.ee link not found for: ${ link }`));
        }

        await browser.close();
      }
    }
  } catch (error) {
    console.error(chalk.red(`[ERROR] Error crawling links: ${ error.message }`));
  }
}

async function downloadFile(url, outputPath) {
  try {
    const data = await request.get(url);
    fs.writeFileSync(outputPath, data);
    console.log(chalk.green(`[SUCCESS] Downloaded: ${ url }`));
  } catch (error) {
    console.error(chalk.red(`[ERROR] Failed to download: ${ url }. Error: ${ error.message }`));
  }
}

fs.mkdirSync('combos', {recursive: true});
crawlPages();
