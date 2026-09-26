/**
 * Upgrades the server-rendered form in place: shortens through the JSON API without a page
 * load, shows the result card with Copy, Share and a QR code, and explains refusals inline.
 *
 * Without this script the same form still works by posting to the server (see
 * src/server/page.ts), so nothing here may be required for the basic flow.
 */
import { renderQr } from "./qr.ts";

/** Only show the spinner if the request is slow, so fast responses don't flicker. */
const SPINNER_DELAY_MS = 150;
const COPIED_FOR_MS = 2000;
const NETWORK_ERROR = "Couldn't reach syhr.sh. Check your connection and try again.";
const SERVER_ERROR = "Something went wrong on our side. Please try again.";

/** What the API answers (see POST /api/links in src/server/app.ts). */
interface ApiLink {
  shortUrl: string;
  url: string;
}

function isApiLink(value: unknown): value is ApiLink {
  return (
    typeof value === "object" &&
    value !== null &&
    "shortUrl" in value &&
    typeof value.shortUrl === "string" &&
    "url" in value &&
    typeof value.url === "string"
  );
}

function messageOf(value: unknown): string | null {
  return typeof value === "object" && value !== null && "message" in value
    ? typeof value.message === "string"
      ? value.message
      : null
    : null;
}

function required<T extends Element>(root: ParentNode, selector: string, type: new () => T): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing ${selector}`);
  return element;
}

/** Enhances the form and result card found in `root`. */
export function enhanceForm(root: Document = document): void {
  const form = required(root, "form.shorten", HTMLFormElement);
  const input = required(form, "#url", HTMLInputElement);
  const field = required(form, ".field", HTMLElement);
  const submit = required(form, ".submit", HTMLButtonElement);
  const error = required(form, "#form-error", HTMLElement);
  const result = required(root, ".result", HTMLElement);
  const shortLink = required(result, ".short-link", HTMLAnchorElement);
  const target = required(result, ".result-url", HTMLElement);
  const copy = required(result, '[data-action="copy"]', HTMLButtonElement);
  const share = required(result, '[data-action="share"]', HTMLButtonElement);
  const again = required(result, '[data-action="again"]', HTMLAnchorElement);
  const qr = required(result, ".qr", HTMLElement);
  const copyLabel = required(copy, ".action-label", HTMLElement);

  let busy = false;
  let copiedTimer = 0;

  const showError = (message: string) => {
    error.textContent = message;
    input.setAttribute("aria-invalid", "true");
    // Restart the shake even if it's already playing: remove the class, re-add it a frame
    // later. Reduced motion turns the animation off in CSS.
    field.classList.remove("shake");
    window.requestAnimationFrame(() => {
      field.classList.add("shake");
    });
  };

  const clearError = () => {
    error.textContent = "";
    input.removeAttribute("aria-invalid");
  };

  const showResult = (link: ApiLink) => {
    shortLink.href = link.shortUrl;
    shortLink.textContent = link.shortUrl;
    target.textContent = link.url;
    renderQr(qr, link.shortUrl);
    share.hidden = !canShare(link.shortUrl);
    resetCopy();
    result.hidden = false;
    shortLink.focus();
  };

  const setBusy = (value: boolean) => {
    busy = value;
    submit.disabled = value;
    form.setAttribute("aria-busy", String(value));
    if (!value) submit.classList.remove("is-busy");
  };

  const resetCopy = () => {
    window.clearTimeout(copiedTimer);
    copy.classList.remove("is-done");
    copyLabel.textContent = "Copy";
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    // On the "link not found" page, that notice stops being relevant once they act.
    root.querySelector(".notice")?.remove();
    clearError();
    result.hidden = true;
    if (input.value.trim() === "") {
      showError("Paste a link to shorten it.");
      return;
    }
    setBusy(true);
    const spinner = window.setTimeout(() => {
      submit.classList.add("is-busy");
    }, SPINNER_DELAY_MS);
    void shorten(input.value)
      .then((outcome) => {
        if (typeof outcome === "string") showError(outcome);
        else showResult(outcome);
      })
      .finally(() => {
        window.clearTimeout(spinner);
        setBusy(false);
      });
  });

  input.addEventListener("input", () => {
    if (input.hasAttribute("aria-invalid")) clearError();
  });
  field.addEventListener("animationend", () => {
    field.classList.remove("shake");
  });

  copy.addEventListener("click", () => {
    void copyText(shortLink.href).then((copied) => {
      if (!copied) return;
      copy.classList.add("is-done");
      copyLabel.textContent = "Copied";
      copiedTimer = window.setTimeout(resetCopy, COPIED_FOR_MS);
    });
  });

  share.addEventListener("click", () => {
    // Cancelling the share sheet rejects; that's not an error worth showing.
    navigator.share({ title: "syhr.sh", url: shortLink.href }).catch(() => undefined);
  });

  again.addEventListener("click", (event) => {
    event.preventDefault();
    result.hidden = true;
    input.value = "";
    clearError();
    input.focus();
  });

  // A result the server rendered (the no-JavaScript path) gets its QR code and Share button.
  if (!result.hidden && shortLink.href) {
    renderQr(qr, shortLink.href);
    share.hidden = !canShare(shortLink.href);
  }
}

/** Calls the API. Resolves to the link, or to a message saying why there isn't one. */
async function shorten(url: string): Promise<ApiLink | string> {
  let response: Response;
  try {
    response = await fetch("/api/links", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    return NETWORK_ERROR;
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.ok && isApiLink(body)) return body;
  return messageOf(body) ?? SERVER_ERROR;
}

function canShare(url: string): boolean {
  if (typeof navigator.share !== "function") return false;
  return typeof navigator.canShare !== "function" || navigator.canShare({ url });
}

/**
 * Copies `text`, falling back to a hidden text area for browsers without the async clipboard
 * API or when it's refused (it needs a secure context and, in some browsers, permission).
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "visually-hidden";
    document.body.append(area);
    area.select();
    // Deprecated, but the only option left in the browsers that get here.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}
