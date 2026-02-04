let DICTIONARY = {};
let replacementsDone = 0;
const MAX_REPLACEMENTS_PER_PAGE = 8;

// Load local dictionary
fetch(browser.runtime.getURL("dic.json"))
    .then(res => res.json())
    .then(dict => {
        DICTIONARY = dict;
        startReplacement();
    });

function startReplacement() {
    const textNodes = getTextNodes(document.body);
    textNodes.forEach(replaceWordsInNode);
}

function getTextNodes(root) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!node.parentElement) return NodeFilter.FILTER_REJECT;

                const tag = node.parentElement.tagName;
                if (
                    ["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "CODE", "PRE"].includes(tag)
                ) {
                    return NodeFilter.FILTER_REJECT;
                }

                if (!node.textContent.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodes = [];
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }
    return nodes;
}

function replaceWordsInNode(textNode) {
    if (replacementsDone >= MAX_REPLACEMENTS_PER_PAGE) return;

    const parts = textNode.textContent.split(/\b/);
    let replaced = false;

    const newHTML = parts.map(part => {
        const key = part.toLowerCase();

        if (
            DICTIONARY[key] &&
            replacementsDone < MAX_REPLACEMENTS_PER_PAGE &&
            Math.random() < 0.25
        ) {
            replacementsDone++;
            replaced = true;

            const entry = DICTIONARY[key];

            return `
        <span class="chinese-word"
              data-original="${part}"
              data-chinese="${entry.chinese}"
              data-pinyin="${entry.pinyin}"
              data-meaning="${entry.meaning}"
              data-state="chinese"
              title="${entry.meaning}">
          <span class="chinese-character">${entry.chinese}</span>
          <span class="pinyin">${entry.pinyin}</span>
        </span>
      `;
        }

        return part;
    }).join("");

    if (replaced) {
        const span = document.createElement("span");
        span.innerHTML = newHTML;
        textNode.replaceWith(span);
    }
}

document.addEventListener("click", e => {
    console.log(e.target);
    const el = e.target.closest('.chinese-word');
    if (!el) return;

    if (el.dataset.state === "chinese") {
        el.innerHTML = el.dataset.original;
        el.dataset.state = "original";
        el.title = el.dataset.meaning;
    } else {
        el.innerHTML = `
      <span class="chinese-character">${el.dataset.chinese}</span>
      <span class="pinyin">${el.dataset.pinyin}</span>
    `;
        el.dataset.state = "chinese";
        el.title = el.dataset.meaning;
    }
});
