/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The link "Copy link" shares (M40, §40.2 Finding 3).
 *
 * `Game.worldLink()` is the page's own address with the world's query, which
 * is right for `history.replaceState` and wrong to hand to anybody else when
 * the page is a file on the player's disk: from the one-file Release it would
 * be `file:///…/<their account name>/Downloads/…html?level=…`, which opens
 * nothing on a friend's machine and publishes a private path.
 *
 * So a page served over http(s) shares its own address unchanged — a fork on
 * its own host shares itself, and a local dev server shares what a tester
 * sees — and a page from anywhere else (`file:`, `blob:`, `data:`, an app
 * shell's own scheme) shares the official build's address carrying only the
 * world's query. Nothing of the file's path, name or fragment travels.
 *
 * Pure: strings in, string out, no `window`, so the headless suite owns it.
 */
export function shareableWorldLink(href: string, homepageUrl: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return homepageUrl;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') return href;

  const shared = new URL(homepageUrl);
  shared.search = url.search;
  shared.hash = '';
  return shared.toString();
}
