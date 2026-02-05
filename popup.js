// Store personal words
let personalWords = [];
let fullDictionary = []; // Will verify against HSK1 for search demo

// Load initial state
document.addEventListener('DOMContentLoaded', async () => {
    // Load config
    const { selectedLists, savedPersonalWords } = await browser.storage.local.get(['selectedLists', 'savedPersonalWords']);

    // Restore checkboxes
    if (selectedLists) {
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = selectedLists.includes(cb.value);
        });
    }

    // Restore personal words
    if (savedPersonalWords) {
        personalWords = savedPersonalWords;
        updatePersonalDisplay();
    }

    // Load dictionary for search functionality  
    try {
        // Load all HSK levels for comprehensive search
        const levels = [1, 2, 3, 4, 5, 6];
        const promises = levels.map(level =>
            fetch(browser.runtime.getURL(`hsk/hsk-level-${level}.json`))
                .then(res => res.json())
                .catch(e => []) // If file doesn't exist, return empty array
        );

        const results = await Promise.all(promises);
        fullDictionary = results.flat();
        console.log(`Loaded ${fullDictionary.length} words for search`);
    } catch (e) {
        console.error("Failed to load dictionary for search", e);
    }
});

// Search functionality
const searchInput = document.getElementById('search-input');
const resultsDiv = document.getElementById('search-results');

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    resultsDiv.innerHTML = '';

    if (query.length < 1) return;

    // Search in full dictionary
    const matches = fullDictionary.filter(entry =>
        entry.hanzi.includes(query) ||
        entry.pinyin.toLowerCase().includes(query) ||
        entry.translations.some(t => t.toLowerCase().includes(query))
    ).slice(0, 10); // Limit to 10 results

    matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <div>
                <strong>${match.hanzi}</strong> 
                <small>(${match.pinyin})</small>
                <div style="font-size:0.8em; color:#666">${match.translations[0]}</div>
            </div>
            <button class="add-btn">Add</button>
        `;

        div.querySelector('.add-btn').addEventListener('click', () => {
            addToPersonalList(match);
            div.querySelector('.add-btn').textContent = 'Added';
            div.querySelector('.add-btn').disabled = true;
            div.querySelector('.add-btn').style.background = '#ccc';
        });

        resultsDiv.appendChild(div);
    });
});

function addToPersonalList(entry) {
    if (!personalWords.find(w => w.id === entry.id)) {
        personalWords.push(entry);
        updatePersonalDisplay();
    }
}

function removeFromPersonalList(entryId) {
    personalWords = personalWords.filter(w => w.id !== entryId);
    updatePersonalDisplay();
}

function updatePersonalDisplay() {
    updatePersonalCount();
    displayPersonalWords();
}

function updatePersonalCount() {
    document.getElementById('personal-count').textContent = personalWords.length;
}

function displayPersonalWords() {
    const displayDiv = document.getElementById('personal-words-display');
    const listDiv = document.getElementById('personal-words-list');

    if (personalWords.length === 0) {
        displayDiv.style.display = 'none';
        return;
    }

    displayDiv.style.display = 'block';
    listDiv.innerHTML = '';

    personalWords.forEach(word => {
        const wordDiv = document.createElement('div');
        wordDiv.className = 'personal-word-item';
        wordDiv.innerHTML = `
            <div class="personal-word-info">
                <strong>${word.hanzi}</strong> <small>(${word.pinyin})</small>
                <div style="font-size:0.8em; color:#666">${word.translations[0]}</div>
            </div>
            <button class="delete-word-btn" data-word-id="${word.id}">×</button>
        `;

        // Add delete functionality
        wordDiv.querySelector('.delete-word-btn').addEventListener('click', (e) => {
            const wordId = parseInt(e.target.getAttribute('data-word-id'));
            removeFromPersonalList(wordId);
        });

        listDiv.appendChild(wordDiv);
    });
}

document.getElementById('clear-personal').addEventListener('click', () => {
    personalWords = [];
    updatePersonalDisplay();
});

// Save functionality
document.getElementById('save-btn').addEventListener('click', async () => {
    const selectedLists = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value);

    await browser.storage.local.set({
        selectedLists,
        savedPersonalWords: personalWords
    });

    const status = document.getElementById('status');
    status.textContent = 'Settings saved! Reload page to apply.';
    setTimeout(() => status.textContent = '', 2000);
});