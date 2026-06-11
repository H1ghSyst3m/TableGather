interface ClipboardLike {
  writeText: (text: string) => Promise<void>;
}

interface FocusableLike {
  focus: () => void;
}

interface TextareaLike extends FocusableLike {
  value: string;
  style: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  select: () => void;
}

interface DocumentLike {
  activeElement?: Partial<FocusableLike> | null;
  body: {
    appendChild: (element: TextareaLike) => void;
    removeChild: (element: TextareaLike) => void;
  };
  createElement: (tagName: "textarea") => TextareaLike;
  execCommand: (command: "copy") => boolean;
}

interface BrowserGlobals {
  navigator?: {
    clipboard?: ClipboardLike;
  };
  document?: DocumentLike;
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  const browser = globalThis as BrowserGlobals;

  try {
    if (browser.navigator?.clipboard?.writeText) {
      await browser.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Some mobile browsers expose the Clipboard API but block it outside secure contexts.
  }

  return copyTextWithTextarea(text);
}

function copyTextWithTextarea(text: string) {
  const documentLike = (globalThis as BrowserGlobals).document;
  if (!documentLike) return false;

  const activeElement = typeof documentLike.activeElement?.focus === "function" ? documentLike.activeElement : null;
  const textarea = documentLike.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  documentLike.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return documentLike.execCommand("copy");
  } catch {
    return false;
  } finally {
    documentLike.body.removeChild(textarea);
    activeElement?.focus?.();
  }
}
