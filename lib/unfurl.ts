import type { LinkPreview } from "@/lib/types";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeText(value?: string) {
  if (!value) {
    return "";
  }

  return decodeHtmlEntities(value.replace(/\s+/g, " ").trim());
}

function findMetaContent(html: string, attribute: "property" | "name", key: string) {
  const expression = new RegExp(
    `<meta[^>]+${attribute}=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${key}["'][^>]*>`,
    "i"
  );
  const result = html.match(expression);

  return normalizeText(result?.[1] || result?.[2]);
}

function findTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return normalizeText(titleMatch?.[1]);
}

function toAbsoluteUrl(candidate: string, base: string) {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return undefined;
  }
}

async function unfurlUrl(url: string): Promise<LinkPreview | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PersonalChatBot/1.0 (+https://example.com)"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000)
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      return null;
    }

    const html = await response.text();
    const title =
      findMetaContent(html, "property", "og:title") ||
      findMetaContent(html, "name", "twitter:title") ||
      findTitle(html);

    const description =
      findMetaContent(html, "property", "og:description") ||
      findMetaContent(html, "name", "description") ||
      findMetaContent(html, "name", "twitter:description");

    const image =
      toAbsoluteUrl(findMetaContent(html, "property", "og:image"), response.url) ||
      toAbsoluteUrl(findMetaContent(html, "name", "twitter:image"), response.url);

    const siteName =
      findMetaContent(html, "property", "og:site_name") ||
      new URL(response.url).hostname.replace(/^www\./, "");

    if (!title && !description && !image) {
      return null;
    }

    return {
      url: response.url,
      hostname: new URL(response.url).hostname.replace(/^www\./, ""),
      title: title || response.url,
      description,
      image,
      siteName
    };
  } catch {
    return null;
  }
}

export async function extractLinkPreviews(text: string): Promise<LinkPreview[]> {
  const urls = [...new Set(text.match(URL_PATTERN) || [])].slice(0, 3);
  const previews = await Promise.all(urls.map((url) => unfurlUrl(url)));
  return previews.filter((preview): preview is LinkPreview => preview !== null);
}
