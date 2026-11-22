(() => {
  "use strict";

  const API_BASE_URL = "https://localhost:7101";
  const app = document.getElementById("app");

  const state = {
    user: null,
    authMode: "login",
    authEmail: "",
    authNotice: null,
    documents: [],
    filters: { buscar: "", categoria: "", tipoSoporte: "" },
    loading: false,
    contentNotice: null,
    selectedDocument: null,
    panel: "list",
    formBusy: false
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    if (!value) return "Sin fecha";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat("es", { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function noticeMarkup(notice, className = "") {
    if (!notice) return "";
    const type = ["success", "error", "info", "warning"].includes(notice.type) ? notice.type : "info";
    return `<div class="notice notice--${type} ${className}" role="${type === "error" ? "alert" : "status"}">${escapeHtml(notice.message)}</div>`;
  }

  function brandMarkup(light = false) {
    return `<div class="brand ${light ? "brand--light" : ""}">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 36" fill="none"><path d="M7 2.5h12l8 8V32a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".9"/><path d="M19 2.5v8h8M10 17h12M10 22h12M10 27h8" stroke="#183653" stroke-width="1.7" stroke-linecap="round"/></svg></span>
      <span>DOCULOCAL</span>
    </div>`;
  }

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, options);
    } catch {
      throw new Error("No fue posible conectarse. Verifica tu conexión e inténtalo nuevamente.");
    }

    const responseText = await response.text();
    let payload = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = responseText;
      }
    }

    if (!response.ok) {
      const message = payload && typeof payload === "object" && typeof payload.mensaje === "string"
        ? payload.mensaje
        : "No fue posible completar la solicitud. Inténtalo nuevamente.";
      throw new Error(message);
    }
    return payload;
  }

  function render() {
    if (!state.user) {
      renderAuth();
      return;
    }
    renderWorkspace();
  }

  function renderAuth() {
    const registering = state.authMode === "register";
    app.innerHTML = `<main class="auth-page">
      <section class="auth-frame" aria-label="Acceso DOCULOCAL">
        <aside class="auth-aside">
          <div>${brandMarkup(true)}
            <h1>Tu archivo, organizado y a tu alcance.</h1>
            <p>Un espacio para registrar y consultar la información de tus documentos físicos y digitales.</p>
          </div>
          <div class="aside-note">Tus documentos, organizados en un solo lugar.</div>
        </aside>
        <section class="auth-main">
          <div class="auth-card">
            <div class="eyebrow">Gestión documental</div>
            <h2>${registering ? "Crear una cuenta" : "Iniciar sesión"}</h2>
            <p class="auth-intro">${registering ? "Registra tu correo para comenzar a organizar tus documentos." : "Ingresa con tu correo y contraseña para continuar."}</p>
            ${noticeMarkup(state.authNotice, "auth-notice")}
            <div class="auth-tabs" role="tablist" aria-label="Acceso a la cuenta">
              <button type="button" class="auth-tab" data-auth-mode="login" role="tab" aria-selected="${!registering}">Iniciar sesión</button>
              <button type="button" class="auth-tab" data-auth-mode="register" role="tab" aria-selected="${registering}">Registrarse</button>
            </div>
            <form id="auth-form" class="auth-form" novalidate>
              <div class="field">
                <label for="auth-email">Correo electrónico</label>
                <input id="auth-email" name="correo" type="email" autocomplete="email" required value="${escapeHtml(state.authEmail)}" placeholder="usuario@empresa.com">
              </div>
              <div class="field">
                <label for="auth-password">Contraseña</label>
                <input id="auth-password" name="contrasena" type="password" autocomplete="${registering ? "new-password" : "current-password"}" minlength="1" required placeholder="Ingresa tu contraseña">
              </div>
              <button class="button button--primary button--full" type="submit">${registering ? "Crear cuenta" : "Entrar"}</button>
            </form>
          </div>
        </section>
      </section>
    </main>`;

    app.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.authMode = button.dataset.authMode;
        state.authNotice = null;
        renderAuth();
      });
    });

    app.querySelector("#auth-form").addEventListener("submit", submitAuth);
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (state.formBusy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const correo = String(data.get("correo") || "").trim();
    const contrasena = String(data.get("contrasena") || "");
    state.authEmail = correo;

    if (!validateEmail(correo) || !contrasena.trim()) {
      state.authNotice = { type: "error", message: "Ingresa un correo electrónico válido y una contraseña." };
      renderAuth();
      return;
    }

    state.formBusy = true;
    const submitButton = form.querySelector("button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = state.authMode === "register" ? "Creando cuenta…" : "Ingresando…";
    try {
      const registering = state.authMode === "register";
      const payload = await request(registering ? "/api/auth/registro" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, contrasena })
      });
      if (registering) {
        state.authMode = "login";
        state.authNotice = { type: "success", message: payload?.mensaje || "Usuario registrado correctamente. Ya puedes iniciar sesión." };
        state.formBusy = false;
        renderAuth();
        return;
      }
      if (!payload || !Number.isInteger(Number(payload.idUsuario)) || Number(payload.idUsuario) <= 0 || typeof payload.correo !== "string") {
        throw new Error("No fue posible completar el inicio de sesión. Inténtalo nuevamente.");
      }
      state.user = { idUsuario: Number(payload.idUsuario), correo: payload.correo };
      state.authNotice = null;
      state.contentNotice = null;
      state.panel = "list";
      await loadDocuments();
    } catch (error) {
      state.authNotice = { type: "error", message: error.message };
      renderAuth();
    } finally {
      state.formBusy = false;
    }
  }

  function renderWorkspace() {
    const view = state.panel === "form" ? renderDocumentForm() : renderDocumentList();
    const initial = state.user.correo.trim().charAt(0).toUpperCase() || "U";
    app.innerHTML = `<div class="app-shell">
      <aside class="sidebar">
        ${brandMarkup(true)}
        <div class="sidebar-caption">Espacio personal</div>
        <div class="side-link is-active" aria-current="page"><span class="side-icon" aria-hidden="true">▦</span><span>Documentos</span></div>
      </aside>
      <main class="workspace">
        <header class="topbar"><div class="topbar-title">DOCULOCAL <span aria-hidden="true">/</span> ${state.panel === "form" ? (state.selectedDocument ? "Editar documento" : "Registrar documento") : "Biblioteca"}</div>
          <div class="topbar-user"><span class="avatar" aria-hidden="true">${escapeHtml(initial)}</span><span>${escapeHtml(state.user.correo)}</span></div>
        </header>
        <div class="page-content">${state.panel === "form" ? "" : noticeMarkup(state.contentNotice, "content-notice")}${view}</div>
      </main>
    </div>`;
    wireWorkspace();
  }

  function renderDocumentList() {
    const total = state.documents.length;
    const rows = state.documents.map((document) => {
      const type = String(document.tipoSoporte || "");
      const typeClass = type.toLowerCase() === "digital" ? "pill pill--digital" : "pill";
      const fileStatus = document.rutaArchivoDigital ? "Adjunto" : "No adjunto";
      return `<tr>
        <td><div class="doc-title">${escapeHtml(document.nombreDocumento)}</div><div class="doc-subtitle">${escapeHtml(document.descripcion || "Sin descripción")}</div></td>
        <td>${escapeHtml(document.categoriaDocumento)}</td>
        <td><span class="${typeClass}">${escapeHtml(type || "Sin tipo")}</span></td>
        <td>${escapeHtml(formatDate(document.fechaDocumento))}</td>
        <td>${escapeHtml(document.ubicacionFisica || "—")}</td>
        <td>${fileStatus}</td>
        <td><div class="row-actions">
          <button type="button" class="icon-button" data-action="edit" data-id="${Number(document.idDocumento)}" aria-label="Editar documento" title="Editar">✎</button>
          <button type="button" class="icon-button icon-button--danger" data-action="delete" data-id="${Number(document.idDocumento)}" aria-label="Eliminar documento" title="Eliminar">⌫</button>
        </div></td>
      </tr>`;
    }).join("");

    return `<div class="page-heading">
      <div><div class="eyebrow">Tu archivo personal</div><h1>Documentos</h1><p>Consulta, busca y administra tus documentos físicos y digitales.</p></div>
      <button type="button" class="button button--primary" data-action="new-document">＋ Registrar documento</button>
    </div>
    <section class="card filters-card" aria-label="Búsqueda y filtros">
      <h2 class="filter-heading">Búsqueda y clasificación</h2>
      <form id="filters-form" class="filters-grid">
        <div class="filter-field"><label for="filter-search">Buscar</label><input id="filter-search" name="buscar" class="search-input" type="search" value="${escapeHtml(state.filters.buscar)}" placeholder="Nombre, descripción o ubicación"></div>
        <div class="filter-field"><label for="filter-category">Categoría</label><input id="filter-category" name="categoria" class="filter-control" type="text" value="${escapeHtml(state.filters.categoria)}" placeholder="Escribe una categoría"></div>
        <div class="filter-field"><label for="filter-support">Tipo de soporte</label><select id="filter-support" name="tipoSoporte" class="filter-control"><option value="">Todos los tipos</option><option value="Fisico" ${state.filters.tipoSoporte === "Fisico" ? "selected" : ""}>Físico</option><option value="Digital" ${state.filters.tipoSoporte === "Digital" ? "selected" : ""}>Digital</option></select></div>
        <div class="filter-actions"><button type="submit" class="button button--teal">Buscar</button><button type="button" class="button button--secondary" data-action="clear-filters">Limpiar</button></div>
      </form>
    </section>
    <section class="card" aria-label="Listado de documentos">
      <div class="results-head"><h2>Documentos registrados</h2><span class="results-count">${total} ${total === 1 ? "resultado" : "resultados"}</span></div>
      ${state.loading ? `<div class="loading">Cargando documentos…</div>` : total === 0 ? `<div class="empty-state"><span class="empty-icon" aria-hidden="true">▤</span><h3>${hasActiveFilters() ? "No hay coincidencias" : "Aún no hay documentos"}</h3><p>${hasActiveFilters() ? "Prueba cambiando o limpiando los filtros." : "Cuando registres documentos desde esta aplicación, aparecerán aquí."}</p></div>` : `<div class="table-wrap"><table class="document-table"><thead><tr><th>Nombre y descripción</th><th>Categoría</th><th>Soporte</th><th>Fecha</th><th>Ubicación física</th><th>Archivo adjunto</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </section>`;
  }

  function hasActiveFilters() {
    return Boolean(state.filters.buscar || state.filters.categoria || state.filters.tipoSoporte);
  }

  function renderDocumentForm() {
    const document = state.selectedDocument;
    const editing = Boolean(document);
    const support = document?.tipoSoporte || "Fisico";
    const customSupport = support !== "Fisico" && support !== "Digital" ? `<option value="${escapeHtml(support)}" selected>${escapeHtml(support)}</option>` : "";
    return `<div class="page-heading">
      <div><div class="eyebrow">${editing ? "Actualizar registro" : "Nuevo registro"}</div><h1>${editing ? "Editar documento" : "Registrar documento"}</h1><p>Completa los datos descriptivos del documento.</p></div>
      <button type="button" class="button button--secondary" data-action="back-list">← Volver a documentos</button>
    </div>
    <section class="card form-card">
      <div id="form-notice">${noticeMarkup(state.contentNotice)}</div>
      <form id="document-form" novalidate>
        <h2 class="form-section-title">Datos del documento</h2>
        <div class="form-grid">
          <div class="field field--wide"><label for="doc-name">Nombre del documento *</label><input id="doc-name" name="NombreDocumento" required value="${escapeHtml(document?.nombreDocumento || "")}" placeholder="Ej. Contrato de arrendamiento"></div>
          <div class="field"><label for="doc-category">Categoría *</label><input id="doc-category" name="CategoriaDocumento" required value="${escapeHtml(document?.categoriaDocumento || "")}" placeholder="Ej.: Académicos, Laborales, Financieros, Legales"></div>
          <div class="field"><label for="doc-type">Tipo de soporte *</label><select id="doc-type" name="TipoSoporte" required><option value="Fisico" ${support === "Fisico" ? "selected" : ""}>Físico</option><option value="Digital" ${support === "Digital" ? "selected" : ""}>Digital</option>${customSupport}</select></div>
          <div class="field"><label for="doc-date">Fecha del documento *</label><input id="doc-date" name="FechaDocumento" type="date" required value="${escapeHtml(dateForInput(document?.fechaDocumento))}"></div>
          <div class="field"><label for="doc-location">Ubicación física (opcional)</label><input id="doc-location" name="UbicacionFisica" value="${escapeHtml(document?.ubicacionFisica || "")}" placeholder="Ej. Estante 1, carpeta azul"></div>
          <div class="field field--wide"><label for="doc-description">Descripción (opcional)</label><textarea id="doc-description" name="Descripcion" placeholder="Agrega información útil para identificar el documento">${escapeHtml(document?.descripcion || "")}</textarea></div>
          <div class="field field--wide"><label for="doc-file">Archivo digital (opcional)</label><div class="file-drop"><div><strong>Selecciona un archivo para adjuntar</strong><br><span class="field-hint">Elige un archivo de tu dispositivo.</span><br><input id="doc-file" name="ArchivoDigital" type="file"></div></div></div>
        </div>
        <div class="form-actions"><button type="button" class="button button--secondary" data-action="back-list">Cancelar</button><button type="submit" class="button button--primary" ${state.formBusy ? "disabled" : ""}>${state.formBusy ? "Guardando…" : editing ? "Guardar cambios" : "Registrar documento"}</button></div>
      </form>
    </section>`;
  }

  function dateForInput(value) {
    if (!value) return new Date().toISOString().slice(0, 10);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function wireWorkspace() {
    app.querySelectorAll('[data-action="new-document"]').forEach((button) => button.addEventListener("click", () => openForm(null)));
    app.querySelectorAll('[data-action="back-list"]').forEach((button) => button.addEventListener("click", backToList));
    app.querySelectorAll('[data-action="clear-filters"]').forEach((button) => button.addEventListener("click", clearFilters));
    app.querySelectorAll('[data-action="edit"]').forEach((button) => button.addEventListener("click", () => openForm(button.dataset.id)));
    app.querySelectorAll('[data-action="delete"]').forEach((button) => button.addEventListener("click", () => deleteDocument(button.dataset.id)));

    const filtersForm = app.querySelector("#filters-form");
    if (filtersForm) filtersForm.addEventListener("submit", applyFilters);
    const documentForm = app.querySelector("#document-form");
    if (documentForm) documentForm.addEventListener("submit", submitDocument);
  }

  async function loadDocuments() {
    if (!state.user) return;
    state.loading = true;
    renderWorkspace();
    const query = new URLSearchParams({ idUsuario: String(state.user.idUsuario) });
    for (const key of ["buscar", "categoria", "tipoSoporte"]) {
      if (state.filters[key]) query.set(key, state.filters[key]);
    }
    try {
      const result = await request(`/api/documentos?${query.toString()}`, { method: "GET", headers: { Accept: "application/json" } });
      if (!Array.isArray(result)) throw new Error("No se pudieron cargar los documentos. Inténtalo nuevamente.");
      state.documents = result;
    } catch (error) {
      state.documents = [];
      state.contentNotice = { type: "error", message: error.message };
    } finally {
      state.loading = false;
      renderWorkspace();
    }
  }

  async function applyFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.filters = {
      buscar: String(data.get("buscar") || "").trim(),
      categoria: String(data.get("categoria") || "").trim(),
      tipoSoporte: String(data.get("tipoSoporte") || "").trim()
    };
    state.contentNotice = null;
    await loadDocuments();
  }

  async function clearFilters() {
    state.filters = { buscar: "", categoria: "", tipoSoporte: "" };
    state.contentNotice = null;
    await loadDocuments();
  }

  function openForm(id) {
    const document = id == null ? null : state.documents.find((item) => Number(item.idDocumento) === Number(id));
    if (id != null && !document) {
      state.contentNotice = { type: "error", message: "No se encontró el documento en el listado actual." };
      renderWorkspace();
      return;
    }
    state.selectedDocument = document;
    state.panel = "form";
    state.contentNotice = null;
    state.formBusy = false;
    renderWorkspace();
  }

  function backToList() {
    state.panel = "list";
    state.selectedDocument = null;
    state.contentNotice = null;
    renderWorkspace();
  }

  function validateDocument(data) {
    const name = String(data.get("NombreDocumento") || "").trim();
    const category = String(data.get("CategoriaDocumento") || "").trim();
    const support = String(data.get("TipoSoporte") || "").trim();
    const date = String(data.get("FechaDocumento") || "").trim();
    if (!name || !category || !support || !date) return "Completa el nombre, la categoría, el tipo de soporte y la fecha.";
    if (!(Number(state.user?.idUsuario) > 0)) return "No fue posible completar la operación. Inténtalo nuevamente.";
    return null;
  }

  function showFormError(message) {
    state.contentNotice = { type: "error", message };
    const notice = app.querySelector("#form-notice");
    if (notice) notice.innerHTML = noticeMarkup(state.contentNotice);
  }

  async function submitDocument(event) {
    event.preventDefault();
    if (state.formBusy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const editing = Boolean(state.selectedDocument);
    const validationError = validateDocument(data);
    if (validationError) {
      showFormError(validationError);
      return;
    }

    data.set("IdUsuario", String(state.user.idUsuario));
    const file = data.get("ArchivoDigital");
    if (!(file instanceof File) || file.size === 0) data.delete("ArchivoDigital");
    state.formBusy = true;
    state.contentNotice = null;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = editing ? "Guardando…" : "Registrando…";

    const path = editing ? `/api/documentos/${Number(state.selectedDocument.idDocumento)}` : "/api/documentos";
    try {
      const result = await request(path, { method: editing ? "PUT" : "POST", body: data });
      state.panel = "list";
      state.selectedDocument = null;
      state.contentNotice = { type: "success", message: result?.mensaje || (editing ? "Documento actualizado correctamente." : "Documento registrado correctamente.") };
      state.formBusy = false;
      await loadDocuments();
    } catch (error) {
      state.formBusy = false;
      submitButton.disabled = false;
      submitButton.textContent = editing ? "Guardar cambios" : "Registrar documento";
      showFormError(error.message);
    }
  }

  async function deleteDocument(id) {
    const document = state.documents.find((item) => Number(item.idDocumento) === Number(id));
    if (!document) {
      state.contentNotice = { type: "error", message: "No se encontró el documento seleccionado." };
      renderWorkspace();
      return;
    }
    const confirmed = window.confirm(`¿Eliminar “${document.nombreDocumento}”? También se eliminará el archivo adjunto, si lo hay.`);
    if (!confirmed) return;
    state.contentNotice = null;
    try {
      const query = new URLSearchParams({ idUsuario: String(state.user.idUsuario) });
      const result = await request(`/api/documentos/${Number(document.idDocumento)}?${query.toString()}`, { method: "DELETE", headers: { Accept: "application/json" } });
      state.contentNotice = { type: "success", message: result?.mensaje || "Documento eliminado correctamente." };
      await loadDocuments();
    } catch (error) {
      state.contentNotice = { type: "error", message: error.message };
      renderWorkspace();
    }
  }

  render();
})();
