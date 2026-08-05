import * as React from "react";

import { useI18n } from "./I18nProvider";
import { translateUserVisibleText } from "./literalTranslation";

const LOCALIZED_ATTRIBUTES = [
  "aria-label",
  "data-description",
  "data-tooltip",
  "placeholder",
  "title",
] as const;

const SKIP_ELEMENT_SELECTOR = [
  "[data-i18n-skip]",
  "[data-message-content]",
  "[data-user-content]",
  ".message-markdown",
  "code",
  "pre",
  "script",
  "style",
].join(",");

const SKIP_TEXT_SELECTOR = [
  SKIP_ELEMENT_SELECTOR,
  "[contenteditable='true']",
  "textarea",
].join(",");

type StoredOriginals = {
  attributes: Partial<Record<(typeof LOCALIZED_ATTRIBUTES)[number], string>>;
  localizedAttributes: Partial<
    Record<(typeof LOCALIZED_ATTRIBUTES)[number], string>
  >;
  localizedText?: string;
  text?: string;
};

const originals = new WeakMap<Node, StoredOriginals>();

function isSkipped(node: Node, selector: string): boolean {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return element?.closest(selector) !== null;
}

function translateTextNode(node: Text, locale: "en" | "zh-CN"): void {
  if (isSkipped(node, SKIP_TEXT_SELECTOR)) return;

  const current = node.nodeValue ?? "";
  const trimmed = current.trim();
  if (trimmed.length === 0) return;

  const stored = originals.get(node) ?? {
    attributes: {},
    localizedAttributes: {},
  };
  if (
    stored.text !== undefined &&
    trimmed !== stored.text &&
    trimmed !== stored.localizedText
  ) {
    stored.text = trimmed;
    stored.localizedText = undefined;
  }
  const source = stored.text ?? trimmed;
  const translated = translateUserVisibleText(locale, source);

  if (translated === source) {
    if (locale === "en" && stored.text !== undefined) {
      const restored = current.replace(trimmed, source);
      if (node.nodeValue !== restored) {
        node.nodeValue = restored;
      }
    }
    return;
  }

  if (stored.text === undefined) {
    stored.text = source;
    originals.set(node, stored);
  }
  stored.localizedText = translated;
  const localized = current.replace(trimmed, translated);
  if (node.nodeValue !== localized) {
    node.nodeValue = localized;
  }
}

function translateElement(element: Element, locale: "en" | "zh-CN"): void {
  if (isSkipped(element, SKIP_ELEMENT_SELECTOR)) return;

  for (const attribute of LOCALIZED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;

    const stored = originals.get(element) ?? {
      attributes: {},
      localizedAttributes: {},
    };
    if (
      stored.attributes[attribute] !== undefined &&
      current !== stored.attributes[attribute] &&
      current !== stored.localizedAttributes[attribute]
    ) {
      stored.attributes[attribute] = current;
      stored.localizedAttributes[attribute] = undefined;
    }
    const source = stored.attributes[attribute] ?? current;
    const translated = translateUserVisibleText(locale, source);

    if (translated === source) {
      if (locale === "en" && stored.attributes[attribute] !== undefined) {
        if (current !== source) {
          element.setAttribute(attribute, source);
        }
      }
      continue;
    }

    if (stored.attributes[attribute] === undefined) {
      stored.attributes[attribute] = source;
      originals.set(element, stored);
    }
    stored.localizedAttributes[attribute] = translated;
    if (current !== translated) {
      element.setAttribute(attribute, translated);
    }
  }
}

function localizeTree(root: Node, locale: "en" | "zh-CN"): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, locale);
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElement(root as Element, locale);
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      translateTextNode(node as Text, locale);
    } else {
      translateElement(node as Element, locale);
    }
    node = walker.nextNode();
  }
}

/** Localize audited legacy UI copy, including content rendered in portals. */
export function DomLocalization() {
  const { locale } = useI18n();

  React.useLayoutEffect(() => {
    localizeTree(document.body, locale);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          localizeTree(mutation.target, locale);
          continue;
        }
        if (mutation.type === "attributes") {
          localizeTree(mutation.target, locale);
          continue;
        }
        for (const node of mutation.addedNodes) {
          localizeTree(node, locale);
        }
      }
    });

    observer.observe(document.body, {
      attributeFilter: [...LOCALIZED_ATTRIBUTES],
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}
