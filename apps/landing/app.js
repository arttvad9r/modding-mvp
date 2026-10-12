(() => {
  "use strict";

  const LANGUAGE_KEY = "mymodz.language";

  const ru = {
    "workspace.validationNote": "Проверка в базовой Factorio 2.0.77. Другие моды и Space Age требуют отдельной проверки.",
    "workspace.new": "Новый запрос",
    "workspace.revise": "Создать новую версию",
    "workspace.revisionPlaceholder": "Что изменить в этой версии?",
    "workspace.refine": "Доработать этот мод",
    "workspace.download": "Скачать ZIP",
    "workspace.changes": "Что изменится",
    "workspace.unavailable": "Генерация сейчас недоступна. Черновик сохранён в этой вкладке. Попробуй позже.",
    "workspace.unsupported": "Запрос выходит за доступные возможности",
    "workspace.failed": "Мод не прошёл проверку",
    "workspace.succeeded": "Проверен и готов",
    "workspace.running": "Собираем и проверяем мод",
    "workspace.queued": "Запрос в очереди",
    "workspace.idle": "Ждём твою идею",
    "workspace.check": "Проверка в Factorio",
    "workspace.build": "Сборка мода",
    "workspace.plan": "Разбор запроса",
    "workspace.emptyCopy": "Опиши изменения слева. Здесь появятся принятые изменения, результат проверки и скачивание.",
    "workspace.emptyTitle": "Здесь начнётся твой мод.",
    "workspace.result": "Твой мод",
    "workspace.hint": "Factorio 2.0 · Русский или английский · Без программирования",
    "workspace.generate": "Сгенерировать мод",
    "workspace.placeholder": "Что должно измениться? Укажи предметы, машины или рецепты, которые хочешь настроить.",
    "workspace.request": "Опиши свой мод",
    "workspace.back": "Назад на сайт",
    "workspace.subtitle": "Запрос, статус сборки и результат — в одном месте.",
    "workspace.title": "Мастерская модов",
    "build.nodeTech": "ОТКРЫТИЕ",
    "build.nodeMachine": "МАШИНА",
    "build.nodeRecipe": "РЕЦЕПТ",
    "build.nodeItem": "ПРЕДМЕТ",
    "skip": "Перейти к содержимому",
    "nav.menu": "Открыть навигацию",
    "nav.result": "Что получишь",
    "nav.build": "Что умеет",
    "nav.validation": "Проверка",
    "cta.build": "Создать мод",
    "cta.example": "Посмотреть пример",
    "hero.eyebrow": "ТВОЯ FACTORIO. ТВОИ ПРАВИЛА.",
    "hero.titleA": "Настрой Factorio",
    "hero.titleB": "под себя.",
    "hero.lede": "Быстрее заводы, новые материалы, свои машины. Опиши идею — MyModz соберёт мод на сайте, проверит его в Factorio и отдаст готовый ZIP.",
    "hero.browser": "Создавай и дорабатывай в браузере. Без установки MyModz.",
    "hero.promptLabel": "Что ты хочешь изменить в Factorio?",
    "hero.placeholder": "Например: создай Усиленную пластину, а затем Усиленную печь, которая её использует.",
    "hero.exampleRebalance": "Ускорить печи",
    "hero.exampleContent": "Новый материал + печь",
    "hero.exampleThroughput": "Рецепты и инвентарь",
    "hero.preview": "ПРИМЕР МОДА · ИЛЛЮСТРАЦИЯ В ИГРЕ",
    "hero.base": "на базе Electric Furnace",
    "hero.speed": "Скорость крафта",
    "hero.energy": "Энергопотребление",
    "hero.modules": "Слоты модулей",
    "hero.verified": "Проверено в Factorio 2.0.77",
    "hero.caption": "Новая печь со своим рецептом и открытием через исследование. Графика — из базовой игры.",
    "proof.web": "Всё на сайте",
    "proof.webCopy": "От идеи до скачивания",
    "proof.noLua": "Без программирования",
    "proof.noLuaCopy": "Опиши на русском или английском",
    "proof.realGame": "Проверка в Factorio",
    "proof.realGameCopy": "Загрузка и проверка изменений",
    "proof.zip": "Готовый ZIP",
    "proof.zipCopy": "Скачивание после проверки",
    "result.eyebrow": "ОТ ЗАПРОСА К РЕЗУЛЬТАТУ В ИГРЕ",
    "result.title": "Одна идея. Цельный мод.",
    "result.copy": "Преврати новый материал в производственную цепочку: рецепт, печь, которая его использует, и исследование для открытия. Всё в одном моде.",
    "result.realScenario": "ПРИМЕР ПОДДЕРЖИВАЕМОГО МОДА",
    "result.sameBundle": "Создаются вместе в одном проверенном моде",
    "result.prompt": "«Создай Усиленную пластину из стали и пластика, а затем Усиленную печь, которой нужно 10 таких пластин.»",
    "result.plate": "2 стальные пластины + 5 пластиковых брусков → 1 пластина · 2 с · стак 100",
    "result.furnace": "Electric Furnace + 10 Усиленных пластин + 5 процессоров · скорость 4",
    "result.unlock": "Открывает новый материал и печь через исследование.",
    "result.passTitle": "Эта цепочка прошла проверку в настоящей Factorio.",
    "result.passCopy": "Проверены предметы, рецепты, параметры и открытие.",
    "build.eyebrow": "ЧТО МОЖНО СОБРАТЬ",
    "build.title": "Четыре способа изменить Factorio.",
    "build.copy": "Ускорь производство, измени рецепты или добавь свой контент. Собери поддерживаемые изменения в один мод.",
    "build.rebalanceTitle": "Баланс машин",
    "build.rebalanceCopy": "Ускоряй печи, сборочные автоматы, буры и лаборатории. Настраивай поддерживаемые конвейеры и манипуляторы.",
    "build.recipeTitle": "Рецепты и инвентарь",
    "build.recipeCopy": "Меняй ингредиенты, время крафта и выход рецептов. Увеличивай стаки поддерживаемых предметов.",
    "build.before": "Было",
    "build.after": "Стало",
    "build.contentTitle": "Создавай новый контент",
    "build.contentCopy": "Добавляй материалы, альтернативные рецепты и машины на основе доступных шаблонов. Связывай их в новые цепочки.",
    "build.researchTitle": "Настраивай прогрессию",
    "build.researchCopy": "Меняй стоимость и зависимости поддерживаемых исследований. Выбирай технологию для открытия нового контента.",
    "build.edge": "связь исследований",
    "flow.eyebrow": "ОТ ИДЕИ ДО ПАПКИ MODS",
    "flow.title": "Весь путь — на одном сайте.",
    "flow.copy": "Напиши запрос, посмотри изменения и скачай мод. Возвращайся к истории, когда захочешь его доработать.",
    "flow.step1Title": "Опиши запрос",
    "flow.step1Copy": "Одна идея или несколько изменений вместе.",
    "flow.step2Title": "Следи за статусом",
    "flow.step2Copy": "В очереди → Сборка + проверка → Готово.",
    "flow.step3Title": "Посмотри, что изменится",
    "flow.step3Copy": "До скачивания видно, что именно меняет мод.",
    "flow.step4Title": "Скачай ZIP",
    "flow.step4Copy": "Положи его в Factorio/mods без распаковки.",
    "flow.promptLabel": "ТВОЙ ЗАПРОС",
    "flow.prompt": "Увеличь скорость электрического бура и лаборатории в два раза.",
    "flow.plan": "Запрос понят",
    "flow.building": "Мод собран",
    "flow.checked": "Factorio проверена",
    "flow.accepted": "Принятые изменения",
    "flow.validated": "Проверен и готов",
    "flow.download": "Скачать",
    "validation.runtime": "FACTORIO 2.0.77",
    "validation.loaded": "Мод успешно загрузился",
    "validation.assert1": "Новые предметы и машины созданы",
    "validation.assert2": "Рецепты и параметры совпадают с запросом",
    "validation.assert3": "Контент открывается через исследование",
    "validation.eyebrow": "УВЕРЕННОСТЬ ПЕРЕД СКАЧИВАНИЕМ",
    "validation.title": "Проверено самой игрой.",
    "validation.copy": "MyModz загружает мод в настоящей Factorio 2.0.77 и сверяет предметы, рецепты, параметры и исследования с принятым запросом. ZIP доступен только после успешной проверки.",
    "validation.trustTitle": "Ты знаешь, что получаешь.",
    "validation.trustCopy": "Если запрос выходит за доступные возможности, MyModz объяснит ограничение, а не пропустит часть твоей идеи.",
    "validation.boundary": "Проверка охватывает базовую Factorio 2.0.77. Совместимость с другими модами или Space Age нужно проверять отдельно в игре.",
    "revision.eyebrow": "ДОРАБОТКА СЛЕДУЮЩИМ СООБЩЕНИЕМ",
    "revision.title": "Измени мод ещё одной фразой.",
    "revision.copy": "Возьми уже созданный мод и опиши, что изменить. Новая версия снова собирается и проверяется, а исходная остаётся в истории.",
    "revision.v1": "Steel Furnace ×1.5 · стоимость Automation ×0.5",
    "revision.validated": "проверено",
    "revision.followup": "«Оставь всё остальное, ускорь печь ещё на 25% и верни стоимость Automation к обычной.»",
    "revision.v2": "Steel Furnace ×1.875 · стоимость Automation обычная",
    "revision.revalidated": "проверено заново",
    "scope.eyebrow": "ЧТО ДОСТУПНО СЕЙЧАС",
    "scope.title": "Полезные изменения. Понятные границы.",
    "scope.copy": "Создавай моды в пределах доступных возможностей Factorio 2.0. Сайт подскажет, если идея выходит за них.",
    "scope.yes": "ПОДДЕРЖИВАЕТСЯ СЕЙЧАС",
    "scope.rebalance": "Баланс поддерживаемых машин, рецептов и инвентаря",
    "scope.content": "Новые материалы, рецепты предметов и доступные машины",
    "scope.tech": "Стоимость, зависимости и открытие исследований",
    "scope.bundle": "Несколько поддерживаемых изменений в одном моде",
    "scope.no": "ПОКА НЕ ОБЕЩАЕМ",
    "scope.control": "Произвольные игровые системы на control.lua",
    "scope.assets": "Новую графику, спрайты или звуки",
    "scope.space": "Произвольный Space Age-специфичный контент",
    "scope.workshop": "Публикацию в Steam Workshop",
    "faq.title": "Перед первым модом.",
    "faq.copy": "Ответы на вопросы перед тем, как превратить идею в мод.",
    "faq.installQ": "Нужно устанавливать MyModz?",
    "faq.installA": "Нет. MyModz — веб-сервис. На сайте создаются и дорабатываются моды; скачивается только итоговый ZIP мода для Factorio.",
    "faq.luaQ": "Нужно знать Lua?",
    "faq.luaA": "Нет. Опиши желаемые изменения на русском или английском. MyModz создаст файлы мода и проверит результат в пределах доступных возможностей.",
    "faq.testedQ": "ZIP действительно тестируется?",
    "faq.testedA": "Да. Мод загружается в изолированной базовой Factorio 2.0.77. До скачивания предметы, рецепты, параметры и исследования сверяются с принятым запросом.",
    "faq.graphicsQ": "У новой машины будет новая графика?",
    "faq.graphicsA": "Новые машины используют графику и иконки доступных шаблонов базовой игры. Можно менять название, рецепт и поддерживаемые параметры; новая графика не генерируется.",
    "faq.modpacksQ": "Гарантируется совместимость с моим модпаком?",
    "faq.modpacksA": "Нет. Текущая проверка доказывает работу с изолированной базовой Factorio 2.0.77. Совместимость со сторонним mod stack всё ещё нужно проверять в самой игре.",
    "faq.editQ": "Можно потом доработать мод?",
    "faq.editA": "Да. Открой успешно созданный мод из истории и опиши следующее изменение. MyModz соберёт и проверит новую версию; исходная останется доступной.",
    "final.eyebrow": "ЧТО БЫ ТЫ ИЗМЕНИЛ?",
    "final.title": "Как будет работать твой завод?",
    "final.copy": "Начни с одной идеи. Создай мод на сайте, посмотри результат и добавь его в Factorio.",
    "final.placeholder": "Например: удвой скорость буров, поставь стак электронных схем 500 и уменьши стоимость Automation вдвое.",
    "footer.copy": "MyModz — независимый проект для создания модов Factorio.",
    "footer.images": "Изображения Factorio: официальный press kit Wube."
  };

  const english = new Map();
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    if (!english.has(element.dataset.i18n)) english.set(element.dataset.i18n, element.textContent);
  });
  // Dynamic status labels are not present in the initial HTML.
  for (const [key, value] of Object.entries({
    "workspace.queued": "Request queued",
    "workspace.running": "Building and checking your mod",
    "workspace.succeeded": "Validated and ready",
    "workspace.failed": "The mod did not pass validation",
    "workspace.unsupported": "This request is outside the supported features",
    "workspace.unavailable": "Generation is currently unavailable. Your draft is saved in this tab. Try again later."
  })) english.set(key, value);
  const englishPlaceholders = new Map();
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    englishPlaceholders.set(element.dataset.i18nPlaceholder, element.getAttribute("placeholder") || "");
  });

  const examples = {
    en: {
      rebalance: "Make steel furnaces 50% faster.",
      content: "Create a new intermediate item called Reinforced Plate from 2 steel plates and 5 plastic bars, then create a Reinforced Furnace that uses 10 Reinforced Plates.",
      throughput: "Make iron gears craft twice as fast, make transport belts produce 4 belts per craft, and set electronic circuit stack size to 500."
    },
    ru: {
      rebalance: "Ускорь стальные печи на 50%.",
      content: "Создай новый промежуточный предмет «Усиленная пластина» из 2 стальных пластин и 5 пластиковых брусков, затем создай «Усиленную печь», которой нужно 10 Усиленных пластин.",
      throughput: "Сделай железные шестерни в 2 раза быстрее, пусть рецепт конвейера выдаёт 4 конвейера, а размер стака электронных схем будет 500."
    }
  };

  function preferredLanguage() {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested === "ru" || requested === "en") return requested;
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === "ru" || stored === "en") return stored;
    return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
  }

  let language = preferredLanguage();

  function textFor(key) {
    return language === "ru" && ru[key] ? ru[key] : english.get(key) ?? key;
  }

  function placeholderFor(key) {
    return language === "ru" && ru[key] ? ru[key] : englishPlaceholders.get(key) ?? "";
  }

  function applyLanguage(next) {
    language = next === "ru" ? "ru" : "en";
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language;
    document.title = language === "ru"
      ? "MyModz — Создавай моды для Factorio обычными словами"
      : "MyModz — Build Factorio mods with plain language";

    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.content = language === "ru"
        ? "Опиши нужный мод для Factorio. MyModz соберёт поддерживаемые изменения на сайте, проверит их в Factorio 2.0.77 и отдаст ZIP."
        : "Describe the Factorio mod you want. MyModz builds supported mods on the website, validates them in Factorio 2.0.77, and gives you the ZIP.";
    }

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = textFor(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", placeholderFor(element.dataset.i18nPlaceholder));
    });
    document.querySelectorAll("[data-lang]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === language));
    });
    renderWorkspace();
  }

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });

  document.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("#hero-prompt");
      if (!input) return;
      input.value = examples[language][button.dataset.example] || "";
      input.focus();
    });
  });

  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const open = navToggle.getAttribute("aria-expanded") !== "true";
      navToggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("open", open);
    });
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      navToggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("open");
    }));
  }

  const header = document.querySelector("[data-header]");
  const syncHeader = () => header?.classList.toggle("scrolled", window.scrollY > 18);
  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });

  function scrollToHash(hash, behavior = "smooth") {
    if (!hash || hash === "#") return;
    if (hash === "#top") {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    if (hash === "#mod-workspace") { openWorkspace("link", ""); return; }
    const target = document.querySelector(hash);
    if (!target) return;

    const headerHeight = header?.offsetHeight || 76;
    const section = target.closest("main > section");
    const useSectionStart = window.innerWidth >= 901 && hash !== "#hero-builder" && section;
    const anchor = useSectionStart ? section : target;
    const extraOffset = useSectionStart ? 0 : headerHeight + 18;
    const top = anchor.getBoundingClientRect().top + window.scrollY - extraOffset;

    window.scrollTo({ top: Math.max(0, top), behavior });
  }

  document.querySelectorAll('a[href^="#"]:not([data-action="build-mod"])').forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      if (!hash || !document.querySelector(hash)) return;
      event.preventDefault();
      history.pushState(null, "", hash);
      scrollToHash(hash, reducedMotion ? "auto" : "smooth");
    });
  });

  function promptForSource(source) {
    if (source === "final") return document.querySelector("#final-prompt")?.value.trim() || "";
    if (source === "hero") return document.querySelector("#hero-prompt")?.value.trim() || "";
    return "";
  }

  const workspace = document.querySelector("#mod-workspace");
  const workspacePrompt = document.querySelector("#workspace-prompt");
  const workspaceForm = document.querySelector("#workspace-form");
  const workspaceSubmit = document.querySelector("#workspace-submit");
  const workspaceMessage = document.querySelector("#workspace-message");
  const DRAFT_KEY = "mymodz.workspace.draft";
  let workspaceSource = "workspace";
  let currentGeneration = null;
  let busy = false;
  let unavailable = false;

  workspacePrompt.value = sessionStorage.getItem(DRAFT_KEY) || "";
  workspacePrompt.addEventListener("input", () => sessionStorage.setItem(DRAFT_KEY, workspacePrompt.value));

  function renderWorkspace() {
    const status = currentGeneration?.status || "idle";
    const statusElement = document.querySelector("#workspace-status");
    statusElement.dataset.i18n = `workspace.${status}`;
    statusElement.textContent = textFor(`workspace.${status}`);
    statusElement.dataset.status = status;
    workspaceSubmit.disabled = busy;
    document.querySelector(".workspace-result").setAttribute("aria-busy", String(busy));
    workspaceMessage.hidden = !unavailable && !currentGeneration?.message;
    workspaceMessage.textContent = unavailable ? textFor("workspace.unavailable") : currentGeneration?.message || "";
    const ready = status === "succeeded";
    const emptyTitle = document.querySelector("#workspace-empty h3");
    emptyTitle.dataset.i18n = status === "idle" ? "workspace.emptyTitle" : `workspace.${status}`;
    emptyTitle.textContent = textFor(emptyTitle.dataset.i18n);
    document.querySelector("#workspace-empty").hidden = ready;
    document.querySelector("#workspace-artifact").hidden = !ready;
    document.querySelector("#workspace-mod-title").textContent = ready ? currentGeneration.title || textFor("workspace.result") : "";
    const changes = document.querySelector("#workspace-changes");
    changes.replaceChildren();
    if (ready) {
      for (const label of (currentGeneration.changes || []).slice(0, 50)) {
        const item = document.createElement("li");
        item.textContent = label;
        changes.append(item);
      }
    }
  }

  function openWorkspace(source, prompt) {
    workspaceSource = source;
    if (prompt) {
      workspacePrompt.value = prompt;
      sessionStorage.setItem(DRAFT_KEY, prompt);
    }
    if (!workspace.open) workspace.showModal();
    workspacePrompt.focus();
  }

  document.querySelectorAll('[data-action="build-mod"]').forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      const source = control.dataset.source || "unknown";
      openWorkspace(source, promptForSource(source));
    });
  });
  document.querySelector("[data-workspace-close]").addEventListener("click", () => workspace.close());
  document.querySelectorAll("[data-workspace-example]").forEach((button) => {
    button.addEventListener("click", () => {
      workspacePrompt.value = examples[language][button.dataset.workspaceExample] || "";
      sessionStorage.setItem(DRAFT_KEY, workspacePrompt.value);
      workspacePrompt.focus();
    });
  });

  function requestGeneration(type, detail, control) {
    busy = true;
    unavailable = false;
    currentGeneration = { status: "queued" };
    renderWorkspace();
    const handled = !control.dispatchEvent(new CustomEvent(type, {
      bubbles: true, cancelable: true, detail
    }));
    if (!handled) {
      busy = false;
      currentGeneration = null;
      unavailable = true;
      renderWorkspace();
    }
  }
  workspaceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    const prompt = workspacePrompt.value.trim();
    if (!prompt) return;
    sessionStorage.setItem(DRAFT_KEY, prompt);
    requestGeneration("mymodz:build-requested", { source: workspaceSource, prompt }, workspaceForm);
  });
  document.querySelector("#workspace-revision").addEventListener("submit", (event) => {
    event.preventDefault();
    const prompt = document.querySelector("#workspace-revision-prompt").value.trim();
    if (busy || !prompt || !currentGeneration?.generationId) return;
    requestGeneration("mymodz:revision-requested", { generationId: currentGeneration.generationId, prompt }, event.currentTarget);
  });
  document.querySelector("#workspace-download").addEventListener("click", (event) => {
    if (!currentGeneration?.generationId) return;
    const handled = !event.currentTarget.dispatchEvent(new CustomEvent("mymodz:download-requested", {
      bubbles: true, cancelable: true, detail: { generationId: currentGeneration.generationId }
    }));
    if (!handled) { unavailable = true; renderWorkspace(); }
  });
  window.addEventListener("mymodz:generation-updated", (event) => {
    const record = event.detail;
    if (!record || !["queued", "running", "succeeded", "failed", "unsupported"].includes(record.status)) return;
    if (record.status === "succeeded" && (typeof record.generationId !== "string" || !record.generationId)) return;
    currentGeneration = {
      status: record.status,
      generationId: typeof record.generationId === "string" ? record.generationId : null,
      title: typeof record.title === "string" ? record.title : "",
      message: typeof record.message === "string" ? record.message : "",
      changes: Array.isArray(record.changes) ? record.changes.filter((label) => typeof label === "string") : []
    };
    busy = ["queued", "running"].includes(record.status);
    unavailable = false;
    renderWorkspace();
  });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveals = document.querySelectorAll(".reveal");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((element) => element.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -7%", threshold: .07 });
    reveals.forEach((element) => observer.observe(element));
  }

  applyLanguage(language);

  window.addEventListener("hashchange", () => scrollToHash(window.location.hash, reducedMotion ? "auto" : "smooth"));
  window.addEventListener("load", () => {
    if (!window.location.hash) return;
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToHash(window.location.hash, "auto")));
  });
})();
