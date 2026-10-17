(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const composerType = urlParams.get("composer") === "contenteditable" ? "contenteditable" : "textarea";
  const wiringType = urlParams.get("wiring") === "click" ? "click" : "form";
  const transportType = urlParams.get("transport") === "xhr" ? "xhr" : "fetch";
  const breakSelectors = urlParams.get("break_selectors") === "1";

  /**
   * State mode:
   *  "dom"        - (default) text is read directly from the DOM element value/innerText on each getComposerText() call.
   *  "controlled" - text is maintained in a JS variable (_controlledText) updated strictly on
   *                 "input" events. The extension's setText() must fire a real "input" event
   *                 to update this variable; simply setting .value/.innerText without an event
   *                 leaves _controlledText stale and sendMessage() will send "" or the previous value.
   *                 This mode simulates React-controlled components that maintain their own state.
   */
  const stateMode = urlParams.get("state") === "controlled" ? "controlled" : "dom";

  const configBanner = document.getElementById("config-banner");
  if (configBanner) {
    configBanner.textContent = `Config: composer=${composerType} | wiring=${wiringType} | transport=${transportType} | state=${stateMode}${breakSelectors ? " | broken=1" : ""}`;
  }

  // Expose state mode on window for adapter verification
  window.__vg_state_mode = stateMode;
  window.__vg_composer_type = composerType;
  window.__vg_wiring_type = wiringType;
  window.__vg_transport_type = transportType;
  window.__vg_break_selectors = breakSelectors;

  const messageList = document.getElementById("message-list");
  const composerSlot = document.getElementById("composer-slot");

  // ---- Controlled state variable ----
  let _controlledText = "";

  function appendMessage(role, text) {
    if (!messageList) return;
    const msgEl = document.createElement("div");
    msgEl.className = `msg msg-${role}`;
    msgEl.textContent = text;
    messageList.appendChild(msgEl);
    messageList.scrollTop = messageList.scrollHeight;
  }

  function getComposerText() {
    if (stateMode === "controlled") {
      return _controlledText;
    }
    const editableId = breakSelectors ? "broken-composer-editable" : "chat-composer-editable";
    const textareaId = breakSelectors ? "broken-composer-textarea" : "chat-composer-textarea";
    if (composerType === "contenteditable") {
      const el = document.getElementById(editableId);
      return el ? el.innerText.trim() : "";
    } else {
      const el = document.getElementById(textareaId);
      return el ? el.value.trim() : "";
    }
  }

  function clearComposer() {
    _controlledText = "";
    const editableId = breakSelectors ? "broken-composer-editable" : "chat-composer-editable";
    const textareaId = breakSelectors ? "broken-composer-textarea" : "chat-composer-textarea";
    if (composerType === "contenteditable") {
      const el = document.getElementById(editableId);
      if (el) {
        el.innerText = "";
        // Dispatch synthetic input event so any external listeners see the clear
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else {
      const el = document.getElementById(textareaId);
      if (el) {
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  async function sendMessage() {
    const text = getComposerText();
    if (!text) return;

    window.__vg_last_sent_text = text;
    appendMessage("user", text);

    if (transportType === "fetch") {
      try {
        const response = await window.fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-transport": "fetch",
          },
          body: JSON.stringify({ message: text }),
        });
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        const data = await response.json();
        appendMessage("assistant", data.reply || "Message received");
        clearComposer();
      } catch (err) {
        console.error("[MOCK_APP] Send Error:", err);
        appendMessage("assistant", `[Send Error] ${err.message}`);
      }
    } else {
      // XMLHttpRequest transport
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/chat", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("x-test-transport", "xhr");
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            appendMessage("assistant", data.reply || "Message received");
            clearComposer();
          } catch {
            appendMessage("assistant", "[Error] Invalid JSON response");
          }
        } else {
          appendMessage("assistant", `[Send Error] HTTP ${xhr.status}`);
        }
      };
      xhr.onerror = () => {
        appendMessage("assistant", "[Send Error] XHR network error or blocked");
      };
      xhr.send(JSON.stringify({ message: text }));
    }
  }

  // Render Composer & Wiring
  const editableId = breakSelectors ? "broken-composer-editable" : "chat-composer-editable";
  const textareaId = breakSelectors ? "broken-composer-textarea" : "chat-composer-textarea";
  const sendBtnId = breakSelectors ? "broken-send-btn" : "send-btn";
  const formId = breakSelectors ? "broken-form" : "chat-form";
  const containerId = breakSelectors ? "broken-container" : "chat-container";

  const composerHtml = composerType === "contenteditable"
    ? `<div id="${editableId}" contenteditable="true" role="textbox" aria-label="Mock chat message"></div>`
    : `<textarea id="${textareaId}" placeholder="Type a message..." aria-label="Mock chat message"></textarea>`;

  const sendBtnHtml = wiringType === "form"
    ? `<button type="submit" id="${sendBtnId}" class="btn btn-send">Send</button>`
    : `<button type="button" id="${sendBtnId}" class="btn btn-send">Send</button>`;

  const programmaticBtnHtml = `<button type="button" id="send-programmatic" class="btn btn-test" title="Test-only: bypasses DOM submit/click handlers">Send Programmatic (Test Only)</button>`;

  let containerHtml = "";
  if (wiringType === "form") {
    containerHtml = `
      <form id="${formId}" class="composer-container" onsubmit="event.preventDefault(); return false;">
        ${composerHtml}
        <div class="controls">
          ${programmaticBtnHtml}
          ${sendBtnHtml}
        </div>
      </form>
    `;
  } else {
    containerHtml = `
      <div id="${containerId}" class="composer-container">
        ${composerHtml}
        <div class="controls">
          ${programmaticBtnHtml}
          ${sendBtnHtml}
        </div>
      </div>
    `;
  }

  if (composerSlot) {
    composerSlot.innerHTML = containerHtml;
  }

  // Bind controlled-mode input listener
  if (stateMode === "controlled") {
    const composerEl = composerType === "contenteditable"
      ? document.getElementById(editableId)
      : document.getElementById(textareaId);

    if (composerEl) {
      composerEl.addEventListener("input", () => {
        if (composerType === "contenteditable") {
          _controlledText = (composerEl.innerText || "").trim();
        } else {
          _controlledText = (composerEl.value || "").trim();
        }
        // Expose for test assertions
        window.__vg_controlled_text = _controlledText;
      });
    }
  }

  // Bind Listeners
  if (wiringType === "form") {
    const form = document.getElementById(formId);
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        sendMessage();
      });
    }
  } else {
    const sendBtn = document.getElementById(sendBtnId);
    if (sendBtn) {
      sendBtn.addEventListener("click", (e) => {
        e.preventDefault();
        sendMessage();
      });
    }
  }

  // Programmatic send button (for Part B backstop tests)
  const progBtn = document.getElementById("send-programmatic");
  if (progBtn) {
    progBtn.addEventListener("click", () => {
      sendMessage();
    });
  }

  // Enter Keydown Listener on Composer
  const composerEl = composerType === "contenteditable"
    ? document.getElementById(editableId)
    : document.getElementById(textareaId);

  if (composerEl) {
    composerEl.addEventListener("keydown", (e) => {
      // Ignore IME composition and Shift+Enter
      if (e.isComposing || e.keyCode === 229) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
})();
