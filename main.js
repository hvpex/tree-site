(function () {
  const STORAGE_KEY = "tree_decor_v1";
  const STORAGE_CUSTOM_CATALOG = "tree_custom_catalog_v1";
  const SURFACE_OFFSET = 0.02;

  const STAND_RADIUS = 1.35;
  const STAND_HEIGHT = 0.22;

  const SNOW_ENABLED = true;
  const SNOW_COUNT = 1200;
  const SNOW_RADIUS = 3.0;
  const SNOW_HEIGHT = 3.2;
  const SNOW_FALL_SPEED = 0.55;
  const SNOW_SWIRL = 0.65;
  const SNOW_DRIFT = 0.22;


  const BUILD_MODE = false;

  const IDB_NAME = "tree_toys_db_v1";
  const IDB_STORE = "images";

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPutBlob(key, blob) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        const e = tx.error;
        db.close();
        reject(e);
      };
    });
  }

  async function idbGetBlob(key) {
    const db = await idbOpen();
    const k1 = String(key || "");
    const k2 = k1.startsWith("idb:") ? k1.slice(4) : "idb:" + k1;

    function getOne(k) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(k);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    try {
      const v1 = await getOne(k1);
      if (v1) {
        db.close();
        return v1;
      }

      const v2 = await getOne(k2);
      db.close();
      return v2 || null;
    } catch (e) {
      db.close();
      throw e;
    }
  }

  function idbKey(x) {
    const s = String(x || "");
    return s.startsWith("idb:") ? s.slice(4) : s;
  }

  async function fileToCompressedBlob(file, opts = {}) {
    const maxSide = opts.maxSide ?? 1024;
    const quality = opts.quality ?? 0.9;

    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });

    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const cnv = document.createElement("canvas");
    cnv.width = w;
    cnv.height = h;
    const ctx = cnv.getContext("2d", { alpha: true });

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    URL.revokeObjectURL(img.src);

    const blob = await new Promise((resolve) =>
      cnv.toBlob((b) => resolve(b), "image/webp", quality)
    );

    if (!blob) throw new Error("toBlob вернул null (браузер?)");
    return blob;
  }

  const canvas = document.getElementById("c");
  const stage = document.getElementById("stage");

  const toyListEl = document.getElementById("toyList");
  const btnClear = document.getElementById("btnClear");
  const toastEl = document.getElementById("toast");
  const tipEl = document.getElementById("tip");

  const panelEl = document.getElementById("panel");
  const btnTogglePanel = document.getElementById("btnTogglePanel");
  const btnClosePanel = document.getElementById("btnClosePanel");

  const scaleRange = document.getElementById("scaleRange");
  const scaleVal = document.getElementById("scaleVal");
  const scaleModeLabel = document.getElementById("scaleModeLabel");
  const btnDelete = document.getElementById("btnDelete");
  const btnDeselect = document.getElementById("btnDeselect");

  const uploadImg = document.getElementById("uploadImg");
  const uploadBy = document.getElementById("uploadBy");
  const uploadNote = document.getElementById("uploadNote");
  const btnAddCustomToy = document.getElementById("btnAddCustomToy");
  const btnExport = document.getElementById("btnExport");

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 1600);
  }

  function openPanel() {
    panelEl?.classList.remove("is-collapsed");
  }
  function closePanel() {
    panelEl?.classList.add("is-collapsed");
  }
  function togglePanel() {
    panelEl?.classList.toggle("is-collapsed");
  }

  function applyViewModeUI() {
    if (BUILD_MODE) return;

    if (btnTogglePanel) btnTogglePanel.style.display = "none";
    if (btnClosePanel) btnClosePanel.style.display = "none";
    if (panelEl) panelEl.style.display = "none";

    if (toyListEl) toyListEl.style.display = "none";

    if (btnAddCustomToy) btnAddCustomToy.disabled = true;
    if (btnExport) btnExport.disabled = true;
    if (btnClear) btnClear.disabled = true;
    if (btnDelete) btnDelete.disabled = true;
    if (btnDeselect) btnDeselect.disabled = true;
    if (scaleRange) scaleRange.disabled = true;
    if (uploadImg) uploadImg.disabled = true;
    if (uploadBy) uploadBy.disabled = true;
    if (uploadNote) uploadNote.disabled = true;
  }


  btnTogglePanel?.addEventListener("click", togglePanel);
  btnClosePanel?.addEventListener("click", closePanel);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
  camera.position.set(0, 1.3, 1.8);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.useLegacyLights = false;
  renderer.setClearColor(0x000000, 0);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.85;

  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 6.2;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 2 - 0.07;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xf7f0e6, 0.95));

  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(4, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0001;
  scene.add(key);

  const warmFill = new THREE.DirectionalLight(0xfff1d2, 0.55);
  warmFill.position.set(-5, 3, 2);
  scene.add(warmFill);

  const coolRim = new THREE.DirectionalLight(0xe9fff7, 0.35);
  coolRim.position.set(0, 3, -7);
  scene.add(coolRim);

  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(
      STAND_RADIUS,
      STAND_RADIUS,
      STAND_HEIGHT,
      64,
      1,
      false
    ),
    new THREE.MeshStandardMaterial({
      color: 0xf2f2f6,
      roughness: 0.96,
      metalness: 0,
    })
  );
  stand.position.y = STAND_HEIGHT / 2;
  stand.receiveShadow = true;
  scene.add(stand);

  const snowTop = new THREE.Mesh(
    new THREE.CircleGeometry(STAND_RADIUS * 0.98, 64),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0,
    })
  );
  snowTop.rotation.x = -Math.PI / 2;
  snowTop.position.y = STAND_HEIGHT + 0.002;
  snowTop.receiveShadow = true;
  scene.add(snowTop);

  function resize() {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  let catalog = [];
  let selectedToyId = null;
  const texturesCache = new Map();

  let treeRoot = null;
  let treeMeshes = [];

  const toysGroup = new THREE.Group();
  scene.add(toysGroup);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let selectedSprite = null;
  let placementScale = 0.26;

  let isDraggingToy = false;
  let dragSprite = null;
  const dragPlane = new THREE.Plane();
  const dragHit = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();
  const vCamDir = new THREE.Vector3();
  const vCamRight = new THREE.Vector3();
  const vCamUp = new THREE.Vector3();

  function setPointerFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -(((ev.clientY - rect.top) / rect.height) * 2 - 1)
    );
  }

  function rayToPlane(ev, plane, outVec3) {
    setPointerFromEvent(ev);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(plane, outVec3);
  }

  function beginDrag(sprite, ev) {
    camera.getWorldDirection(vCamDir);
    dragPlane.setFromNormalAndCoplanarPoint(vCamDir, sprite.position);

    const hit = rayToPlane(ev, dragPlane, dragHit);
    if (!hit) return;

    dragOffset.copy(sprite.position).sub(dragHit);

    isDraggingToy = true;
    dragSprite = sprite;

    controls.enabled = false;
    canvas.setPointerCapture?.(ev.pointerId);
  }

  function updateDrag(ev) {
    if (!isDraggingToy || !dragSprite) return;
    const hit = rayToPlane(ev, dragPlane, dragHit);
    if (!hit) return;
    dragSprite.position.copy(dragHit).add(dragOffset);
  }

  function endDrag(ev) {
    if (!isDraggingToy) return;
    isDraggingToy = false;
    dragSprite = null;
    controls.enabled = true;
    persistAllSprites();
    canvas.releasePointerCapture?.(ev.pointerId);
  }

  window.addEventListener("keydown", (e) => {
    if (!BUILD_MODE) return;

    if (e.key === "Escape") closePanel();
    if (!selectedSprite) return;

    const key = e.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return;

    e.preventDefault();

    let step = 0.02;
    if (e.shiftKey) step = 0.06;
    if (e.altKey) step = 0.008;

    camera.getWorldDirection(vCamDir);
    vCamRight.crossVectors(vCamDir, camera.up).normalize();
    vCamUp.copy(camera.up).normalize();

    if (key === "ArrowLeft") selectedSprite.position.addScaledVector(vCamRight, -step);
    if (key === "ArrowRight") selectedSprite.position.addScaledVector(vCamRight, +step);
    if (key === "ArrowUp") selectedSprite.position.addScaledVector(vCamUp, +step);
    if (key === "ArrowDown") selectedSprite.position.addScaledVector(vCamUp, -step);

    persistAllSprites();
  });

  let starBaseScale = 1;
  let starMesh = null;
  let starLightRef = null;

  let snow = null,
    snowGeo = null,
    snowPos = null,
    snowVel = null,
    snowMeta = null;
  const rand = (a, b) => a + Math.random() * (b - a);

  function resetSnowParticle(i) {
    const r = Math.sqrt(Math.random()) * SNOW_RADIUS;
    const ang = Math.random() * Math.PI * 2;

    snowPos[i * 3 + 0] = Math.cos(ang) * r;
    snowPos[i * 3 + 1] = STAND_HEIGHT + rand(0.5, SNOW_HEIGHT);
    snowPos[i * 3 + 2] = Math.sin(ang) * r;

    snowVel[i * 3 + 0] = rand(-SNOW_DRIFT, SNOW_DRIFT);
    snowVel[i * 3 + 1] = -rand(0.25, 1.0) * SNOW_FALL_SPEED;
    snowVel[i * 3 + 2] = rand(-SNOW_DRIFT, SNOW_DRIFT);

    snowMeta[i * 2 + 0] = ang;
    snowMeta[i * 2 + 1] = r;
  }

  function initSnow() {
    if (!SNOW_ENABLED) return;

    snowGeo = new THREE.BufferGeometry();
    snowPos = new Float32Array(SNOW_COUNT * 3);
    snowVel = new Float32Array(SNOW_COUNT * 3);
    snowMeta = new Float32Array(SNOW_COUNT * 2);

    for (let i = 0; i < SNOW_COUNT; i++) resetSnowParticle(i);
    snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));

    snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.026,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
    );
    snow.frustumCulled = false;
    scene.add(snow);
  }

  function updateSnow(dt) {
    if (!snow || !snowGeo) return;

    const swirl = SNOW_SWIRL * dt;

    for (let i = 0; i < SNOW_COUNT; i++) {
      snowPos[i * 3 + 0] += snowVel[i * 3 + 0] * dt;
      snowPos[i * 3 + 1] += snowVel[i * 3 + 1] * dt;
      snowPos[i * 3 + 2] += snowVel[i * 3 + 2] * dt;

      let ang = snowMeta[i * 2 + 0];
      const r = snowMeta[i * 2 + 1];

      ang += swirl * (0.35 + 0.65 * (1 - r / SNOW_RADIUS));
      snowMeta[i * 2 + 0] = ang;

      const tx = Math.cos(ang) * r;
      const tz = Math.sin(ang) * r;

      snowPos[i * 3 + 0] = THREE.MathUtils.lerp(snowPos[i * 3 + 0], tx, 0.03);
      snowPos[i * 3 + 2] = THREE.MathUtils.lerp(snowPos[i * 3 + 2], tz, 0.03);

      const x = snowPos[i * 3 + 0];
      const z = snowPos[i * 3 + 2];
      const dist = Math.sqrt(x * x + z * z);
      if (dist > SNOW_RADIUS * 1.15) {
        resetSnowParticle(i);
        continue;
      }
      if (snowPos[i * 3 + 1] < STAND_HEIGHT + 0.02) resetSnowParticle(i);
    }

    snowGeo.attributes.position.needsUpdate = true;
  }

  async function loadSavedDecor() {
    if (!BUILD_MODE) {
      try {
        const res = await fetch("./decor.json", { cache: "no-store" });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveDecor(list) {
    if (!BUILD_MODE) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function persistAllSprites() {
    if (!BUILD_MODE) return;
    const list = [];
    toysGroup.children.forEach((spr) => {
      if (!spr || !spr.isSprite) return;
      list.push({
        toyId: spr.userData.toyId,
        by: spr.userData.by || null,
        note: spr.userData.note || null,
        position: { x: spr.position.x, y: spr.position.y, z: spr.position.z },
        scale: spr.scale.x,
      });
    });
    saveDecor(list);
  }

  function loadCustomCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_CATALOG);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  function saveCustomCatalog(list) {
    localStorage.setItem(STORAGE_CUSTOM_CATALOG, JSON.stringify(list));
  }

  function makeToyId() {
    return (
      "u_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function syncActiveToyUI() {
    if (!toyListEl) return;
    [...toyListEl.querySelectorAll(".toy")].forEach((el) => {
      el.classList.toggle("toy--active", el.dataset.id === selectedToyId);
    });
  }
  function selectToy(id) {
    selectedToyId = id;
    syncActiveToyUI();
  }

  const previewUrlMap = new Map();
  function setImgPreview(imgEl, toy) {
    if (!imgEl || !toy) return;

    if (typeof toy.url === "string" && toy.url.startsWith("idb:")) {
      imgEl.src = "";
      const k = idbKey(toy.url);
      idbGetBlob(k)
        .then((blob) => {
          if (!blob) return;
          const old = previewUrlMap.get(toy.id);
          if (old) URL.revokeObjectURL(old);
          const u = URL.createObjectURL(blob);
          previewUrlMap.set(toy.id, u);
          imgEl.src = u;
        })
        .catch(() => {});
    } else {
      imgEl.src = toy.url;
    }
  }

  function renderToyList() {
    if (!toyListEl) return;
    toyListEl.innerHTML = "";
    catalog.forEach((item) => {
      const card = document.createElement("div");
      card.className = "toy";
      card.dataset.id = item.id;

      const img = document.createElement("img");
      img.alt = item.name || "Игрушка";
      setImgPreview(img, item);

      const meta = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = item.name || "Игрушка";

      const by = document.createElement("div");
      by.className = "by";
      by.textContent = item.by ? `от ${item.by}` : "";

      meta.appendChild(name);
      meta.appendChild(by);

      card.appendChild(img);
      card.appendChild(meta);

      card.addEventListener("click", () => {
        if (!BUILD_MODE) return;
        selectToy(item.id);
      });

      toyListEl.appendChild(card);
    });

    if (!selectedToyId && catalog[0]) selectToy(catalog[0].id);
  }

  function setEditorEnabled(enabled) {
    if (btnDelete) btnDelete.disabled = !enabled;
    if (btnDeselect) btnDeselect.disabled = !enabled;
  }
  function setScaleUI(mode, value) {
    if (scaleModeLabel) scaleModeLabel.textContent = mode;
    if (scaleRange) scaleRange.value = String(value);
    if (scaleVal) scaleVal.textContent = Number(value).toFixed(2);
  }
  function deselectSprite() {
    selectedSprite = null;
    setEditorEnabled(false);
    setScaleUI("для добавления", placementScale);
  }
  function selectSprite(sprite) {
    selectedSprite = sprite;
    setEditorEnabled(true);
    setScaleUI("для выбранной", sprite.scale.x);
  }
  function deleteSprite(sprite) {
    toysGroup.remove(sprite);
    if (selectedSprite === sprite) deselectSprite();
    persistAllSprites();
    toast("Удалено");
  }

  if (scaleRange) {
    scaleRange.min = "0.06";
    scaleRange.max = "1.20";
    scaleRange.step = "0.01";
  }

  scaleRange?.addEventListener("input", () => {
    if (!BUILD_MODE) return;
    const v = Number(scaleRange.value);
    if (scaleVal) scaleVal.textContent = v.toFixed(2);
    if (selectedSprite) {
      selectedSprite.scale.setScalar(v);
      persistAllSprites();
    } else {
      placementScale = v;
    }
  });

  btnDelete?.addEventListener(
    "click",
    () => BUILD_MODE && selectedSprite && deleteSprite(selectedSprite)
  );
  btnDeselect?.addEventListener("click", () => BUILD_MODE && deselectSprite());

  window.addEventListener("keydown", (e) => {
    if (!BUILD_MODE) return;
    if (!selectedSprite) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSprite(selectedSprite);
    }
  });

  btnClear?.addEventListener("click", () => {
    if (!BUILD_MODE) return;
    while (toysGroup.children.length) toysGroup.remove(toysGroup.children[0]);
    localStorage.removeItem(STORAGE_KEY);
    deselectSprite();
    toast("Очищено");
  });


  async function loadCatalog() {
    const res = await fetch("./catalog.json", { cache: "no-store" });
    if (!res.ok) throw new Error("catalog.json не найден");

    const base = await res.json();
    if (!Array.isArray(base) || base.length === 0)
      throw new Error("catalog.json пуст");

    const custom = BUILD_MODE ? loadCustomCatalog() : [];

    const map = new Map();
    [...base, ...custom].forEach((x) => {
      if (x && x.id) map.set(x.id, x);
    });

    catalog = [...map.values()];
    renderToyList();

    if (!placementScale || placementScale === 0.26) {
      const first = catalog[0];
      placementScale =
        first && first.defaultScale ? first.defaultScale : placementScale;
    }
    setScaleUI("для добавления", placementScale);
  }

  const getToyById = (id) => catalog.find((x) => x.id === id);

  function loadTexture(url) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, resolve, undefined, reject);
    });
  }

  async function getToyTexture(toyId) {
    if (texturesCache.has(toyId)) return texturesCache.get(toyId);

    const toy = getToyById(toyId);
    if (!toy) throw new Error("toyId не найден: " + toyId);

    let url = toy.url;
    let objectUrlToRevoke = null;

    if (typeof url === "string" && url.startsWith("idb:")) {
      const blob = await idbGetBlob(idbKey(url));
      if (!blob) throw new Error("Картинка не найдена в IndexedDB: " + url);
      objectUrlToRevoke = URL.createObjectURL(blob);
      url = objectUrlToRevoke;
    }

    const tex = await loadTexture(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    texturesCache.set(toyId, tex);

    if (objectUrlToRevoke) {
      setTimeout(() => URL.revokeObjectURL(objectUrlToRevoke), 2000);
    }
    return tex;
  }

  async function addToySprite(toyId, position, scale, extra) {
    const tex = await getToyTexture(toyId);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const spr = new THREE.Sprite(mat);

    spr.position.set(position.x, position.y, position.z);
    spr.scale.setScalar(scale);
    spr.userData = {
      toyId,
      by: extra?.by || null,
      note: extra?.note || null,
    };

    toysGroup.add(spr);
    return spr;
  }

  async function restoreDecor() {
    const saved = await loadSavedDecor();
    for (const item of saved) {
      if (!getToyById(item.toyId)) continue;
      await addToySprite(
        item.toyId,
        item.position,
        item.scale || placementScale,
        item
      );
    }
  }

  function tipShow(px, py, html) {
    if (!tipEl) return;
    tipEl.innerHTML = html;
    tipEl.style.left = px + "px";
    tipEl.style.top = py + "px";
    tipEl.classList.remove("hidden");
  }
  function tipHide() {
    tipEl?.classList.add("hidden");
  }

  function tipHtmlForSprite(sprite) {
    const toy = getToyById(sprite.userData.toyId);
    const by = sprite.userData.by || toy?.by || "—";
    const note = (sprite.userData.note ?? toy?.note ?? "").trim();

    return `
      <div class="t1">Игрушка от <b>${by}</b></div>
      ${note ? `<div class="t2">${note}</div>` : ``}
    `;
  }

  function hitTestSprites(ev) {
    setPointerFromEvent(ev);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(toysGroup.children, true);
    return hits.length ? hits[0].object : null;
  }

  function slugifyName(name) {
    const s = String(name || "").trim();
    if (!s) return "toy";
    return (
      s
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 40) || "toy"
    );
  }

  function extFromMime(mime) {
    const m = (mime || "").toLowerCase();
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    return "webp";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function splitFilename(full) {
    const s = String(full || "").trim();
    const dot = s.lastIndexOf(".");
    if (dot <= 0) return { base: s || "toy", ext: "" };
    return { base: s.slice(0, dot), ext: s.slice(dot + 1) };
  }

  function safeFilePart(s) {
    return (
      String(s || "")
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 80) || "toy"
    );
  }

  function buildExportFilename(file) {
    const { base } = splitFilename(file?.name || "toy.webp");
    const safe = safeFilePart(base);
    return `${safe}.webp`;
  }


  function loadTree() {
    return new Promise((resolve, reject) => {
      const loader = new THREE.GLTFLoader();
      const TREE_URL = `./assets/tree.glb?v=${Date.now()}`;

      loader.load(
        TREE_URL,
        (gltf) => {
          treeRoot = gltf.scene;
          scene.add(treeRoot);

          treeMeshes = [];
          treeRoot.traverse((obj) => {
            if (!obj.isMesh) return;

            treeMeshes.push(obj);
            obj.castShadow = true;
            obj.receiveShadow = true;

            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              if (!m) return;
              m.side = THREE.DoubleSide;

              const hasRealAlpha =
                !!m.alphaMap ||
                m.transparent === true ||
                (typeof m.opacity === "number" && m.opacity < 1);

              if (hasRealAlpha) {
                m.transparent = false;
                m.alphaTest = 0.45;
                m.depthWrite = true;
                m.depthTest = true;
                m.opacity = 1.0;
              } else {
                m.alphaTest = 0;
              }
              m.needsUpdate = true;
            });
          });

          treeRoot.traverse((obj) => {
            if (!obj.name) return;
            if (obj.name === "Star") {
              starMesh = obj;
              starMesh.visible = false;
              starBaseScale = obj.scale.x;

              const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
              mats.forEach((m) => {
                if (!m) return;
                if ("emissive" in m) {
                  m.color.set(0xffd200);
                  m.emissive.set(0xffc400);
                  m.emissiveIntensity = 2.6;
                  m.needsUpdate = true;
                }
              });

              starLightRef = new THREE.PointLight(0xffc800, 34.0, 3.0, 2.0);
              starLightRef.castShadow = false;
              scene.add(starLightRef);
            }
          });

          const box = new THREE.Box3().setFromObject(treeRoot);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          treeRoot.position.sub(center);

          const targetHeight = 2.3;
          const s = targetHeight / Math.max(size.y, 0.0001);
          treeRoot.scale.setScalar(s);

          const boxAfter = new THREE.Box3().setFromObject(treeRoot);
          treeRoot.position.y -= boxAfter.min.y;
          treeRoot.position.y += STAND_HEIGHT;

          const box2 = new THREE.Box3().setFromObject(treeRoot);
          const size2 = box2.getSize(new THREE.Vector3());
          const center2 = box2.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size2.x, size2.y, size2.z);

          controls.target.copy(center2);
          controls.update();

          camera.position.set(0, maxDim * 0.6, maxDim * 1.7);
          camera.lookAt(center2);

          resolve();
        },
        undefined,
        reject
      );
    });
  }

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointermove", (ev) => {
    if (isDraggingToy) {
      tipHide();
      updateDrag(ev);
      return;
    }

    const spr = hitTestSprites(ev);
    if (!spr) {
      tipHide();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    tipShow(ev.clientX - rect.left, ev.clientY - rect.top, tipHtmlForSprite(spr));
  });

  canvas.addEventListener("pointerup", (ev) => {
    if (!BUILD_MODE) return;
    if (ev.button !== 0) return;
    endDrag(ev);
  });

  canvas.addEventListener("pointercancel", (ev) => {
    if (!BUILD_MODE) return;
    endDrag(ev);
  });

  canvas.addEventListener("pointerleave", tipHide);

  canvas.addEventListener("pointerdown", async (ev) => {
    if (!BUILD_MODE) return;
    if (ev.button !== 0) return;

    const spr = hitTestSprites(ev);
    if (spr) {
      selectSprite(spr);
      beginDrag(spr, ev);
      return;
    }

    deselectSprite();
    if (!treeMeshes.length || !selectedToyId) return;

    setPointerFromEvent(ev);
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(treeMeshes, true);
    if (!hits.length) return;

    const hit = hits[0];
    const p = hit.point.clone();

    if (hit.face && hit.object) {
      const n = hit.face.normal.clone();
      n.transformDirection(hit.object.matrixWorld);
      p.add(n.multiplyScalar(SURFACE_OFFSET));
    }

    const toy = getToyById(selectedToyId);
    await addToySprite(selectedToyId, { x: p.x, y: p.y, z: p.z }, placementScale, toy);
    persistAllSprites();
  });

  canvas.addEventListener("pointerdown", (ev) => {
    if (!BUILD_MODE) return;
    if (ev.button !== 2) return;
    const spr = hitTestSprites(ev);
    if (!spr) return;
    deleteSprite(spr);
  });

  if (btnAddCustomToy) {
    btnAddCustomToy.addEventListener("click", async () => {
      if (!BUILD_MODE) return;

      try {
        const file = uploadImg?.files?.[0];
        if (!file) {
          toast("Выбери картинку");
          return;
        }

        toast("Сжимаю…");
        const blob = await fileToCompressedBlob(file, { maxSide: 1024, quality: 0.9 });

        const by = (uploadBy?.value || "").trim();
        const note = (uploadNote?.value || "").trim();

        const id = makeToyId();
        const storageKey = "idb:" + id;

        toast("Сохраняю…");
        await idbPutBlob(idbKey(storageKey), blob);

        const exportFilename = buildExportFilename(file);
        const displayName = splitFilename(file.name).base || "Игрушка";

        const newToy = {
          id,
          name: displayName,
          url: storageKey,
          defaultScale: placementScale || 0.26,
          by: by || null,
          note: note || null,
          exportFilename,
        };

        const custom = loadCustomCatalog();
        custom.push(newToy);
        saveCustomCatalog(custom);

        if (!catalog.some((x) => x.id === newToy.id)) catalog.push(newToy);

        renderToyList();
        selectToy(newToy.id);

        if (uploadImg) uploadImg.value = "";
        if (uploadBy) uploadBy.value = "";
        if (uploadNote) uploadNote.value = "";

        toast("Игрушка добавлена");
      } catch (e) {
        console.error(e);
        const msg = e?.message ? e.message : String(e);
        toast("Не удалось: " + msg.slice(0, 120));
      }
    });
  }

  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      if (!BUILD_MODE) return;

      try {
        if (!window.JSZip) {
          toast("JSZip не подключён (проверь <script> в index.html)");
          return;
        }

        toast("Экспорт в ZIP…");

        const zip = new JSZip();
        const toysFolder = zip.folder("assets/toys");

        const decor = await loadSavedDecor();
        const outCatalog = [];

        for (const item of catalog) {
          if (typeof item.url === "string" && item.url.startsWith("./assets/")) {
            outCatalog.push({ ...item });
            continue;
          }

          if (typeof item.url === "string" && item.url.startsWith("idb:")) {
            const blob = await idbGetBlob(idbKey(item.url));
            if (!blob) continue;

            const filename =
              (item.exportFilename && String(item.exportFilename).endsWith(".webp"))
                ? item.exportFilename
                : `${slugifyName(item.name || item.by || "toy")}-${item.id}.webp`;

            toysFolder.file(filename, blob);

            outCatalog.push({
              ...item,
              url: `./assets/toys/${filename}`,
              exportFilename: filename,
            });
            continue;
          }

          outCatalog.push({ ...item });
        }

        zip.file("catalog.json", JSON.stringify(outCatalog, null, 2));
        zip.file("decor.json", JSON.stringify(decor, null, 2));

        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, "tree-export.zip");

        toast("Готово ✅ (tree-export.zip)");
      } catch (e) {
        console.error(e);
        toast("Экспорт не удался (F12 → Console)");
      }
    });
  }

  const clock = new THREE.Clock();

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.033);
    const t = clock.elapsedTime;

    updateSnow(dt);

    if (starLightRef && starMesh) {
      starMesh.getWorldPosition(starLightRef.position);
      starLightRef.intensity =
        18 +
        10 * (0.5 + 0.5 * Math.sin(t * 2.0)) +
        4 * (0.5 + 0.5 * Math.sin(t * 12.0));
    }

    if (starMesh) {
      const pulse = 1.0 + 0.03 * Math.sin(t * 2.0);
      starMesh.scale.setScalar(starBaseScale * pulse);
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  (async function start() {
    try {
      toast("Загрузка…");

      applyViewModeUI();

      initSnow();
      setEditorEnabled(false);

      await loadCatalog();
      await loadTree();
      await restoreDecor();

      resize();
      requestAnimationFrame(resize);

      animate();
      toast("Готово 🎄");
    } catch (e) {
      console.error(e);
      toast("Ошибка. Открой Console (F12).");
    }
  })();
})();
