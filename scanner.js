// scanner.js - Simple vulnerability scanner (CommonJS, Windows-safe)

const axios = require('axios');
const cheerio = require('cheerio');
const { program } = require('commander');

// Simple color helpers
function color(text, code) { return `\x1b[${code}m${text}\x1b[0m`; }
const red = (t) => color(t, 31);
const green = (t) => color(t, 32);
const yellow = (t) => color(t, 33);
const cyan = (t) => color(t, 36);
const bold = (t) => color(t, 1);

program
  .requiredOption('-u, --url <url>', 'URL to scan (include http:// or https://)')
  .parse(process.argv);

const { url } = program.opts();

async function fetchPage(u) {
  try {
    const res = await axios.get(u, {
      timeout: 10000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'VScanner/1.0' }
    });
    return res;
  } catch (err) {
    throw new Error('Failed to fetch page: ' + (err.message || err));
  }
}

function checkSecurityHeaders(headers) {
  const findings = [];

  if (!headers['content-security-policy'])
    findings.push({ title: 'Missing Content-Security-Policy', severity: 'high' });
  if (!headers['x-frame-options'])
    findings.push({ title: 'Missing X-Frame-Options', severity: 'medium' });
  if (!headers['x-content-type-options'])
    findings.push({ title: 'Missing X-Content-Type-Options', severity: 'low' });

  return findings;
}

function checkHtmlSafety(html) {
  const $ = cheerio.load(html);
  const findings = [];

  const inlineScripts = $('script:not([src])').length;
  if (inlineScripts > 0)
    findings.push({ title: 'Inline <script> tags present', severity: 'medium' });

  $('form').each((i, el) => {
    const hasHiddenToken = $(el)
      .find('input[type="hidden"][name*="csrf"], input[type="hidden"][name*="token"]').length;
    if (!hasHiddenToken)
      findings.push({ title: 'Form without CSRF token', severity: 'high' });
  });

  return findings;
}

async function runScan(targetUrl) {
  console.log(bold(`\n🔍 Scanning ${targetUrl}...\n`));
  let res;
  try {
    res = await fetchPage(targetUrl);
  } catch (err) {
    console.error(red('Error:'), err.message || err);
    return;
  }

  const headerFindings = checkSecurityHeaders(res.headers);
  const htmlFindings = checkHtmlSafety(res.data);
  const findings = [...headerFindings, ...htmlFindings];

  if (findings.length === 0) {
    console.log(green('✅ No obvious basic issues found.'));
    return;
  }

  console.log(yellow(`⚠️ Found ${findings.length} potential issue(s):\n`));
  findings.forEach((f, i) => {
    console.log(red(`${i + 1}. ${f.title} (${f.severity.toUpperCase()})`));
  });
}

runScan(url).catch((err) => {
  console.error(red('Fatal error:'), err.message || err);
  process.exit(1);
});
