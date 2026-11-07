(() => {
  "use strict";

  // ======================== REPOSITORY CONFIGURATION ========================
  // Replace these values with the public GitHub repository that stores your PDFs.
  const CONFIG = Object.freeze({
    owner: "Alpha786876",
    repo: "TheStemAtlas",
    branch: "main",
    pdfRoot: "",                 // Optional, e.g. "Library". Leave empty for repository root.
    cacheMinutes: 10,
    apiBase: "https://api.github.com"
  });
  // ==========================================================================

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const elements = {
    themeToggle: $("#themeToggle"), menuToggle: $("#menuToggle"), mobileNav: $("#mobileNav"),
    searchForm: $("#searchForm"), search: $("#bookSearch"), clearSearch: $("#clearSearch"),
    sort: $("#sortSelect"), filters: $("#categoryFilters"), subWrap: $("#subcategoryWrap"),
    subFilter: $("#subcategoryFilter"), status: $("#libraryStatus"), statusText: $("#statusText"),
    retry: $("#retryLoad"), grid: $("#bookGrid"), empty: $("#emptyState"),
    count: $("#collectionCount"), subcount: $("#collectionSubcount"), subjectMap: $("#subjectMap"),
    overlay: $("#transitionOverlay"), skip: $("#skipAnimation"), closePresentation: $("#closePresentation"),
    globeBookToken: $("#globeBookToken"), presentation: $("#bookPresentation"),
    presentationTitle: $("#presentationTitle"), presentationCategory: $("#presentationCategory"),
    presentationHeading: $("#presentationHeading"), presentationView: $("#presentationView"),
    presentationDownload: $("#presentationDownload"), arrivalBook: $("#arrivalBook"),
    reader: $("#readerModal"), readerTitle: $("#readerTitle"), frame: $("#pdfFrame"),
    readerNewTab: $("#readerNewTab"), readerDownload: $("#readerDownload"),
    fallbackOpen: $("#fallbackOpen"), fallback: $("#readerFallback"), readerClose: $("#readerClose")
  };

  const state = {
    books: [], categories: [], activeCategory: "all", activeSubcategory: "all",
    query: "", sort: "name", loadError: null, animationTimer: null,
    animationId: 0, animationSeen: false, selectedBook: null,
    readerBook: null, lastFocused: null, audioContext: null,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches
  };

  const palette = [
    ["#3c2d1b", "#17130d", "#f2cf85"], ["#29352f", "#101915", "#d9c58c"],
    ["#343047", "#171321", "#d8bd83"], ["#3d2b28", "#1b1110", "#f0c68a"],
    ["#283443", "#101820", "#d5c18b"], ["#3a3522", "#17150c", "#e6c47b"]
  ];

  function setStatus(message, kind = "normal", retry = false) {
    elements.statusText.textContent = message;
    elements.status.classList.toggle("is-error", kind === "error");
    elements.retry.hidden = !retry;
  }

  function validConfig() {
    return CONFIG.owner && CONFIG.repo &&
      CONFIG.owner !== "YOUR_GITHUB_USERNAME" &&
      !/[<> ]/.test(CONFIG.owner + CONFIG.repo);
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function repoCacheKey() {
    return `stem-atlas-catalogue:${CONFIG.owner}/${CONFIG.repo}:${CONFIG.branch}:${CONFIG.pdfRoot}`;
  }

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(repoCacheKey()) || "null");
      if (!parsed || !Array.isArray(parsed.books)) return null;
      if (Date.now() - parsed.savedAt > CONFIG.cacheMinutes * 60_000) return null;
      return parsed.books;
    } catch (_) { return null; }
  }

  function writeCache(books) {
    try {
      localStorage.setItem(repoCacheKey(), JSON.stringify({ savedAt: Date.now(), books }));
    } catch (_) { /* Storage may be unavailable or full. */ }
  }

  async function githubJSON(url) {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
    });
    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = data.message || "";
      } catch (_) {}
      const error = new Error(detail || `GitHub returned HTTP ${response.status}.`);
      error.status = response.status;
      error.remaining = response.headers.get("X-RateLimit-Remaining");
      throw error;
    }
    return response.json();
  }

  function normalizedBook(path, sha, size) {
    const parts = path.split("/");
    const filename = parts.pop();
    const withoutExtension = filename.replace(/\.pdf$/i, "");
    const rootParts = CONFIG.pdfRoot ? CONFIG.pdfRoot.split("/").filter(Boolean).length : 0;
    const relativeFolders = parts.slice(rootParts);
    const title = withoutExtension
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, char => char.toUpperCase());
    const category = relativeFolders[0] || "Uncategorised";
    const subcategories = relativeFolders.slice(1);
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(CONFIG.owner)}/${encodeURIComponent(CONFIG.repo)}/${encodeURIComponent(CONFIG.branch)}/${encodePath(path)}`;
    return {
      id: path, path, title: title || "Untitled PDF", category,
      subcategory: subcategories.join(" / "),
      folder: relativeFolders.join(" / ") || "Root",
      sha: sha || "", size: Number(size) || 0, rawUrl
    };
  }

  function isPdfPath(path) {
    return /\.pdf$/i.test(path) && (!CONFIG.pdfRoot || path === CONFIG.pdfRoot || path.startsWith(`${CONFIG.pdfRoot}/`));
  }

  async function discoverWithRecursiveTree() {
    const branchData = await githubJSON(`${CONFIG.apiBase}/repos/${encodeURIComponent(CONFIG.owner)}/${encodeURIComponent(CONFIG.repo)}/branches/${encodeURIComponent(CONFIG.branch)}`);
    const treeSha = branchData?.commit?.commit?.tree?.sha || branchData?.commit?.sha;
    if (!treeSha) throw new Error("Could not resolve the selected GitHub branch.");
    const tree = await githubJSON(`${CONFIG.apiBase}/repos/${encodeURIComponent(CONFIG.owner)}/${encodeURIComponent(CONFIG.repo)}/git/trees/${treeSha}?recursive=1`);
    if (!Array.isArray(tree.tree)) throw new Error("GitHub returned an unexpected repository tree.");
    if (tree.truncated) return null;
    return tree.tree
      .filter(item => item.type === "blob" && isPdfPath(item.path))
      .map(item => normalizedBook(item.path, item.sha, item.size));
  }

  async function discoverByDirectoryWalk() {
    const rootUrl = `${CONFIG.apiBase}/repos/${encodeURIComponent(CONFIG.owner)}/${encodeURIComponent(CONFIG.repo)}/contents`;
    const queue = [{ path: CONFIG.pdfRoot, url: CONFIG.pdfRoot ? `${rootUrl}/${encodePath(CONFIG.pdfRoot)}` : rootUrl }];
    const visited = new Set();
    const books = [];
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current.path)) continue;
      visited.add(current.path);
      const entries = await githubJSON(`${current.url}?ref=${encodeURIComponent(CONFIG.branch)}`);
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry.type === "dir") {
          queue.push({ path: entry.path, url: `${rootUrl}/${encodePath(entry.path)}` });
        } else if (entry.type === "file" && /\.pdf$/i.test(entry.name) && isPdfPath(entry.path)) {
          books.push(normalizedBook(entry.path, entry.sha, entry.size));
        }
      }
    }
    return books;
  }

  async function loadCatalogue({ force = false } = {}) {
    if (!validConfig()) {
      state.books = [];
      renderAll();
      setStatus("Add your public GitHub owner and repository in the CONFIG block at the top of script.js.", "error");
      return;
    }
    if (!force) {
      const cached = readCache();
      if (cached) {
        state.books = cached;
        rebuildCategories();
        renderAll();
        setStatus(`${cached.length} PDF ${cached.length === 1 ? "book" : "books"} loaded from the recent catalogue cache.`);
        // Refresh quietly in the background; a successful response replaces the cache.
        refreshCatalogueInBackground();
        return;
      }
    }
    elements.grid.setAttribute("aria-busy", "true");
    setStatus("Mapping the repository and discovering PDF books…");
    try {
      let books = await discoverWithRecursiveTree();
      if (books === null) {
        setStatus("The repository is large; indexing its folders individually…");
        books = await discoverByDirectoryWalk();
      }
      state.books = books;
      writeCache(state.books);
      rebuildCategories();
      renderAll();
      setStatus(`${state.books.length} PDF ${state.books.length === 1 ? "book" : "books"} discovered from GitHub.`);
    } catch (error) {
      state.loadError = error;
      // Use stale cache if one exists, but do not hide the failure.
      const stale = readCache();
      if (stale) {
        state.books = stale;
        rebuildCategories();
        renderAll();
        setStatus(`Showing cached books. GitHub refresh failed: ${error.message}`, "error", true);
      } else {
        state.books = [];
        rebuildCategories();
        renderAll();
        let message = error.message;
        if (error.status === 404) message = "Repository or branch not found. Check the owner, repository name and branch in script.js.";
        if (error.status === 403 && error.remaining === "0") message = "GitHub API rate limit reached. Wait a little and retry, or use the cached catalogue.";
        if (!navigator.onLine) message = "You appear to be offline. Reconnect and try again.";
        setStatus(message, "error", true);
      }
    } finally {
      elements.grid.setAttribute("aria-busy", "false");
    }
  }

  async function refreshCatalogueInBackground() {
    try {
      let books = await discoverWithRecursiveTree();
      if (books === null) books = await discoverByDirectoryWalk();
      state.books = books;
      writeCache(state.books);
      rebuildCategories();
      renderAll();
      setStatus(`${state.books.length} PDF ${state.books.length === 1 ? "book" : "books"} discovered from GitHub.`);
    } catch (_) {
      // Existing cached content stays usable. Explicit retry remains available only on a hard failure.
    }
  }

  function rebuildCategories() {
    const map = new Map();
    for (const book of state.books) {
      if (!map.has(book.category)) map.set(book.category, []);
      map.get(book.category).push(book);
    }
    state.categories = [...map.entries()]
      .map(([name, books]) => ({ name, count: books.length }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (state.activeCategory !== "all" && !map.has(state.activeCategory)) state.activeCategory = "all";
    renderFilters();
    renderSubjects();
  }

  function renderFilters() {
    elements.filters.replaceChildren();
    const all = makeFilterButton("All resources", "all", state.books.length);
    elements.filters.append(all);
    for (const category of state.categories) {
      elements.filters.append(makeFilterButton(category.name, category.name, category.count));
    }
    const hasSubcategories = state.books.some(book => book.category === state.activeCategory && book.subcategory);
    elements.subWrap.hidden = state.activeCategory === "all" || !hasSubcategories;
    if (!elements.subWrap.hidden) {
      const options = [...new Set(state.books
        .filter(book => book.category === state.activeCategory && book.subcategory)
        .map(book => book.subcategory))].sort((a, b) => a.localeCompare(b));
      elements.subFilter.replaceChildren(new Option("All subcategories", "all"));
      options.forEach(value => elements.subFilter.add(new Option(value, value)));
      if (!options.includes(state.activeSubcategory)) state.activeSubcategory = "all";
      elements.subFilter.value = state.activeSubcategory;
    } else {
      state.activeSubcategory = "all";
    }
  }

  function makeFilterButton(label, value, count) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${state.activeCategory === value ? " is-selected" : ""}`;
    button.dataset.category = value;
    button.setAttribute("aria-pressed", String(state.activeCategory === value));
    button.textContent = `${label} · ${count}`;
    return button;
  }

  function renderSubjects() {
    elements.subjectMap.replaceChildren();
    if (!state.categories.length) {
      const empty = document.createElement("div");
      empty.className = "subject-empty";
      empty.textContent = "Subjects will appear here when the repository contains PDFs.";
      elements.subjectMap.append(empty);
      return;
    }
    state.categories.forEach((category, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subject-tile";
      button.dataset.subject = category.name;
      const number = document.createElement("span");
      number.className = "subject-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.className = "subject-name";
      name.textContent = category.name;
      const count = document.createElement("span");
      count.className = "subject-count";
      count.textContent = `${category.count} ${category.count === 1 ? "BOOK" : "BOOKS"}`;
      const arrow = document.createElement("span");
      arrow.className = "subject-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      button.append(number, name, count, arrow);
      elements.subjectMap.append(button);
    });
  }

  function getVisibleBooks() {
    const query = state.query.trim().toLocaleLowerCase();
    let books = state.books.filter(book => {
      const categoryMatch = state.activeCategory === "all" || book.category === state.activeCategory;
      const subMatch = state.activeSubcategory === "all" || book.subcategory === state.activeSubcategory;
      const haystack = [book.title, book.category, book.subcategory, book.folder, book.path, book.path.replace(/\.pdf$/i, "")]
        .join(" ").toLocaleLowerCase();
      return categoryMatch && subMatch && (!query || haystack.includes(query));
    });
    if (state.sort !== "repo") {
      books = [...books].sort((a, b) => a.title.localeCompare(b.title));
    }
    return books;
  }

  function renderAll({ animate = false } = {}) {
    renderFilters();
    const books = getVisibleBooks();
    elements.grid.replaceChildren();
    elements.grid.hidden = books.length === 0;
    elements.empty.hidden = books.length !== 0;
    elements.count.textContent = `${state.books.length} ${state.books.length === 1 ? "book" : "books"}`;
    elements.subcount.textContent = `${state.categories.length} ${state.categories.length === 1 ? "subject" : "subjects"} represented`;
    books.forEach((book, index) => {
      const card = createBookCard(book, index);
      if (animate) card.style.setProperty("--arrival", `${Math.min(index, 8) * 65}ms`);
      elements.grid.append(card);
    });
    if (state.sort === "repo") {
      elements.subcount.textContent = "Showing the order returned by the GitHub repository tree.";
    }
    elements.grid.setAttribute("aria-busy", "false");
  }

  function createBookCard(book, index) {
    const card = document.createElement("article");
    card.className = "book-card";
    card.style.setProperty("--arrival", `${Math.min(index, 8) * 55}ms`);
    const [coverA, coverB, mark] = palette[index % palette.length];

    const cover = document.createElement("div");
    cover.className = "book-cover";
    cover.style.setProperty("--cover-a", coverA);
    cover.style.setProperty("--cover-b", coverB);
    cover.style.setProperty("--cover-mark", mark);
    const coverIndex = document.createElement("span");
    coverIndex.className = "cover-index";
    coverIndex.textContent = `FIELD GUIDE / ${String(index + 1).padStart(2, "0")}`;
    const glyph = document.createElement("span");
    glyph.className = "cover-glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = categoryGlyph(book.category);
    const wordmark = document.createElement("span");
    wordmark.className = "cover-wordmark";
    wordmark.textContent = "STEM ATLAS";
    cover.append(coverIndex, glyph, wordmark);

    const meta = document.createElement("div");
    meta.className = "book-meta";
    const category = document.createElement("span");
    category.className = "book-category";
    category.textContent = book.category;
    const label = document.createElement("span");
    label.className = "pdf-label";
    label.textContent = "PDF";
    meta.append(category, label);

    const title = document.createElement("h3");
    title.className = "book-title";
    title.textContent = book.title;
    const path = document.createElement("span");
    path.className = "book-path";
    path.title = book.path;
    path.textContent = book.subcategory || book.folder;

    const actions = document.createElement("div");
    actions.className = "book-actions";
    const read = document.createElement("button");
    read.type = "button";
    read.className = "book-action primary";
    read.textContent = "Read online ↗";
    read.addEventListener("click", () => selectBook(book));
    const download = document.createElement("a");
    download.className = "book-action";
    download.href = book.rawUrl;
    download.target = "_blank";
    download.rel = "noopener";
    download.setAttribute("download", book.title + ".pdf");
    download.textContent = "Download ↓";
    download.setAttribute("aria-label", `Download ${book.title} PDF`);
    actions.append(read, download);
    card.append(cover, meta, title, path, actions);
    return card;
  }

  function categoryGlyph(category) {
    const key = category.toLowerCase();
    if (key.includes("math")) return "∑";
    if (key.includes("phys")) return "∿";
    if (key.includes("python") || key.includes("program")) return "{ }";
    if (key.includes("engineer")) return "⌘";
    if (key.includes("artificial") || key === "ai") return "✳";
    if (key.includes("chem")) return "⚗";
    if (key.includes("bio")) return "⌬";
    return "✧";
  }

  function playEagleLikeCall() {
    // A short, generated bird-call cue; no external audio file or network request is needed.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = state.audioContext || (state.audioContext = new AudioContextClass());
      if (context.state === "suspended") context.resume();
      const now = context.currentTime;
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.075, now + 0.08);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
      master.connect(context.destination);
      [0, 0.16, 0.34].forEach((offset, index) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = index === 1 ? "triangle" : "sawtooth";
        const base = 1180 - index * 145;
        osc.frequency.setValueAtTime(base, now + offset);
        osc.frequency.exponentialRampToValueAtTime(base * 0.63, now + offset + 0.28);
        osc.frequency.exponentialRampToValueAtTime(base * 0.82, now + offset + 0.5);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(index === 1 ? 0.22 : 0.13, now + offset + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.48);
        osc.connect(gain); gain.connect(master);
        osc.start(now + offset); osc.stop(now + offset + 0.52);
      });
    } catch (_) { /* Audio is optional; animation remains fully usable if blocked. */ }
  }

  function setPresentation(book) {
    state.selectedBook = book;
    elements.presentationTitle.textContent = book.title;
    elements.presentationCategory.textContent = `${book.category.toUpperCase()} / PDF`;
    elements.presentationHeading.textContent = book.title;
    elements.globeBookToken.textContent = book.title.length > 22 ? `${book.title.slice(0, 20)}…` : book.title;
    elements.presentationDownload.href = book.rawUrl;
    elements.presentationDownload.setAttribute("download", `${book.title}.pdf`);
    elements.arrivalBook.style.setProperty("--arrival-cover", palette[Math.abs(book.id.length) % palette.length][0]);
  }

  function startTransition(book) {
    finishTransition(false);
    const id = ++state.animationId;
    setPresentation(book);
    elements.overlay.classList.remove("is-presented", "is-active");
    void elements.overlay.offsetWidth;
    elements.overlay.classList.add("is-active");
    elements.overlay.setAttribute("aria-hidden", "false");
    elements.skip.focus({ preventScroll: true });
    if (!state.reducedMotion) {
      // The outline bird is timed to enter after the globe has expanded.
      window.setTimeout(() => { if (id === state.animationId) playEagleLikeCall(); }, 2500);
      state.animationTimer = window.setTimeout(() => {
        if (id === state.animationId) finishTransition(true);
      }, 8200);
    } else {
      state.animationTimer = window.setTimeout(() => {
        if (id === state.animationId) finishTransition(true);
      }, 80);
    }
    return id;
  }

  function finishTransition(showPresentation = true) {
    if (state.animationTimer) clearTimeout(state.animationTimer);
    state.animationTimer = null;
    state.animationId++;
    elements.overlay.classList.remove("is-active");
    if (showPresentation && state.selectedBook) {
      elements.overlay.classList.add("is-presented");
      elements.overlay.setAttribute("aria-hidden", "false");
      elements.presentationView.focus({ preventScroll: true });
    } else {
      elements.overlay.classList.remove("is-presented");
      elements.overlay.setAttribute("aria-hidden", "true");
    }
    state.animationSeen = true;
  }

  function selectBook(book) {
    startTransition(book);
  }

  function openReader(book) {
    state.readerBook = book;
    state.lastFocused = document.activeElement;
    elements.readerTitle.textContent = book.title;
    elements.readerNewTab.href = book.rawUrl;
    elements.readerDownload.href = book.rawUrl;
    elements.readerDownload.setAttribute("download", `${book.title}.pdf`);
    elements.fallbackOpen.href = book.rawUrl;
    elements.fallback.hidden = true;
    elements.frame.hidden = false;
    elements.frame.src = book.rawUrl;
    elements.reader.hidden = false;
    document.body.classList.add("modal-open");
    elements.readerClose.focus();
  }

  function closeReader() {
    if (elements.reader.hidden) return;
    elements.frame.src = "about:blank";
    elements.reader.hidden = true;
    document.body.classList.remove("modal-open");
    if (state.lastFocused && typeof state.lastFocused.focus === "function") state.lastFocused.focus();
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("stem-atlas-theme", theme); } catch (_) {}
    const next = theme === "dark" ? "light" : "dark";
    elements.themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0c0b09" : "#f4f0e7");
  }

  function setupTheme() {
    setTheme(document.documentElement.dataset.theme || "dark");
    elements.themeToggle.addEventListener("click", () => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  }

  function setupNavigation() {
    elements.menuToggle.addEventListener("click", () => {
      const open = elements.menuToggle.getAttribute("aria-expanded") !== "true";
      elements.menuToggle.setAttribute("aria-expanded", String(open));
      elements.menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      elements.mobileNav.hidden = !open;
    });
    $$("#mobileNav a").forEach(link => link.addEventListener("click", () => {
      elements.mobileNav.hidden = true;
      elements.menuToggle.setAttribute("aria-expanded", "false");
      elements.menuToggle.setAttribute("aria-label", "Open navigation");
    }));
    const sections = ["home", "library", "explore", "about"].map(id => document.getElementById(id));
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            $$(".desktop-nav .nav-link").forEach(link => {
              const active = link.getAttribute("href") === `#${entry.target.id}`;
              link.classList.toggle("is-active", active);
            });
          }
        });
      }, { rootMargin: "-35% 0px -55% 0px" });
      sections.forEach(section => section && observer.observe(section));
    }
  }

  function setupSearch() {
    elements.search.addEventListener("input", () => {
      state.query = elements.search.value;
      elements.clearSearch.hidden = !state.query;
      renderAll();
    });
    elements.searchForm.addEventListener("submit", event => {
      event.preventDefault();
      state.query = elements.search.value;
      renderAll({ animate: true });
      const firstMatch = getVisibleBooks()[0];
      if (firstMatch) selectBook(firstMatch);
    });
    elements.clearSearch.addEventListener("click", () => {
      elements.search.value = "";
      state.query = "";
      elements.clearSearch.hidden = true;
      renderAll();
      elements.search.focus();
    });
    elements.sort.addEventListener("change", () => {
      state.sort = elements.sort.value;
      renderAll();
    });
    elements.filters.addEventListener("click", event => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.activeCategory = button.dataset.category;
      state.activeSubcategory = "all";
      renderAll();
    });
    elements.subFilter.addEventListener("change", () => {
      state.activeSubcategory = elements.subFilter.value;
      renderAll();
    });
    elements.subjectMap.addEventListener("click", event => {
      const tile = event.target.closest("[data-subject]");
      if (!tile) return;
      state.activeCategory = tile.dataset.subject;
      state.activeSubcategory = "all";
      renderAll();
      document.getElementById("library").scrollIntoView({ behavior: state.reducedMotion ? "auto" : "smooth" });
    });
    $("#resetFilters").addEventListener("click", () => {
      state.activeCategory = "all";
      state.activeSubcategory = "all";
      state.query = "";
      elements.search.value = "";
      elements.clearSearch.hidden = true;
      renderAll();
    });
  }

  function setupAnimation() {
    elements.skip.addEventListener("click", () => finishTransition(true));
    elements.presentationView.addEventListener("click", () => {
      if (state.selectedBook) openReader(state.selectedBook);
    });
    elements.closePresentation.addEventListener("click", () => {
      elements.overlay.classList.remove("is-presented");
      elements.overlay.setAttribute("aria-hidden", "true");
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (!elements.reader.hidden) closeReader();
        else if (elements.overlay.classList.contains("is-active")) finishTransition(true);
        else if (elements.overlay.classList.contains("is-presented")) {
          elements.overlay.classList.remove("is-presented");
          elements.overlay.setAttribute("aria-hidden", "true");
        } else if (!elements.mobileNav.hidden) {
          elements.mobileNav.hidden = true;
          elements.menuToggle.setAttribute("aria-expanded", "false");
        }
      }
    });
  }

  function setupReader() {
    elements.readerClose.addEventListener("click", closeReader);
    elements.reader.addEventListener("click", event => {
      if (event.target === elements.reader) closeReader();
    });
    elements.frame.addEventListener("error", () => {
      elements.frame.hidden = true;
      elements.fallback.hidden = false;
    });
    // Native PDF viewers may fail silently; reveal the fallback only after a generous load window.
    elements.frame.addEventListener("load", () => {
      if (elements.frame.src === "about:blank") return;
      elements.fallback.hidden = true;
    });
    elements.reader.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const focusable = $$("a[href],button:not([disabled])", elements.reader).filter(node => !node.hidden);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  function setupReveal() {
    const nodes = $$(".reveal");
    if (!("IntersectionObserver" in window) || state.reducedMotion) {
      nodes.forEach(node => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12 });
    nodes.forEach(node => observer.observe(node));
  }

  function setupFooter() {
    $("#currentYear").textContent = String(new Date().getFullYear());
    window.addEventListener("online", () => loadCatalogue({ force: true }));
    window.addEventListener("offline", () => setStatus("You are offline. Previously loaded books remain available if cached.", "error", true));
  }

  function init() {
    setupTheme();
    setupNavigation();
    setupSearch();
    setupAnimation();
    setupReader();
    setupReveal();
    setupFooter();
    elements.retry.addEventListener("click", () => loadCatalogue({ force: true }));
    loadCatalogue();
  }

  document.addEventListener("DOMContentLoaded", init, { once: true });
})();
