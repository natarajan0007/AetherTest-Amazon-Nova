"""PageAgent bridge — injects PageAgent into browser and provides indexed element actions via CDP."""
import json
import logging
import asyncio
from typing import Optional
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── PageAgent Injection Script ────────────────────────────────────────────────
# This JavaScript is injected into every page to enable indexed element interactions.
# Based on PageAgent's page-controller library (https://github.com/nicepkg/page-agent)

PAGEAGENT_INJECTION_SCRIPT = """
(function() {
    if (window.__AetherPageAgentInjected) return;
    window.__AetherPageAgentInjected = true;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PageAgent DOM Extraction (simplified from page-controller)
    // ═══════════════════════════════════════════════════════════════════════════
    
    const INTERACTIVE_TAGS = new Set([
        'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
        'label', 'option', 'video', 'audio', 'img', 'canvas'
    ]);
    
    const INTERACTIVE_ROLES = new Set([
        'button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'listbox',
        'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
        'tab', 'tabpanel', 'switch', 'slider', 'spinbutton', 'searchbox',
        'treeitem', 'gridcell', 'row', 'cell'
    ]);
    
    const INCLUDE_ATTRIBUTES = [
        'title', 'type', 'checked', 'name', 'role', 'value', 'placeholder',
        'alt', 'aria-label', 'aria-expanded', 'data-state', 'aria-checked',
        'id', 'for', 'target', 'contenteditable', 'href'
    ];
    
    // Element index map
    let selectorMap = new Map();
    let highlightIndex = 0;
    
    function isInteractive(el) {
        if (!(el instanceof HTMLElement)) return false;
        
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        
        // Check tag
        if (INTERACTIVE_TAGS.has(tag)) return true;
        
        // Check role
        if (role && INTERACTIVE_ROLES.has(role)) return true;
        
        // Check contenteditable
        if (el.isContentEditable) return true;
        
        // Check onclick handler
        if (el.onclick || el.getAttribute('onclick')) return true;
        
        // Check tabindex
        const tabindex = el.getAttribute('tabindex');
        if (tabindex && parseInt(tabindex) >= 0) return true;
        
        // Check cursor style
        const style = window.getComputedStyle(el);
        if (style.cursor === 'pointer') return true;
        
        return false;
    }
    
    function isVisible(el) {
        if (!(el instanceof HTMLElement)) return false;
        
        const style = window.getComputedStyle(el);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity) === 0) return false;
        
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        
        return true;
    }
    
    function isTopElement(el) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        // Check if point is in viewport
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
            return true; // Consider out-of-viewport elements as "top"
        }
        
        const topEl = document.elementFromPoint(x, y);
        if (!topEl) return true;
        
        return el === topEl || el.contains(topEl) || topEl.contains(el);
    }
    
    function getElementText(el, maxLength = 50) {
        let text = '';
        
        // Try aria-label first
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) text = ariaLabel;
        
        // Try innerText
        if (!text) {
            text = el.innerText || el.textContent || '';
        }
        
        // Try value for inputs
        if (!text && el instanceof HTMLInputElement) {
            text = el.value || el.placeholder || '';
        }
        
        // Try alt for images
        if (!text && el instanceof HTMLImageElement) {
            text = el.alt || '';
        }
        
        // Clean and truncate
        text = text.trim().replace(/\\s+/g, ' ');
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        
        return text;
    }
    
    function getElementAttributes(el) {
        const attrs = {};
        for (const attr of INCLUDE_ATTRIBUTES) {
            const value = el.getAttribute(attr);
            if (value && value.trim()) {
                attrs[attr] = value.trim().substring(0, 30);
            }
        }
        return attrs;
    }
    
    function buildIndexedDOM() {
        selectorMap.clear();
        highlightIndex = 0;
        
        const lines = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text && text.length > 2) {
                    const parent = node.parentElement;
                    if (parent && isVisible(parent) && !selectorMap.has(parent)) {
                        // Only show text if parent is not interactive
                        if (!isInteractive(parent)) {
                            lines.push(text.substring(0, 100));
                        }
                    }
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                
                if (!isVisible(el)) continue;
                if (!isInteractive(el)) continue;
                if (!isTopElement(el)) continue;
                
                // Assign index
                const idx = highlightIndex++;
                selectorMap.set(idx, el);
                
                // Build line
                const tag = el.tagName.toLowerCase();
                const attrs = getElementAttributes(el);
                const text = getElementText(el);
                
                let attrStr = Object.entries(attrs)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' ');
                
                let line = `[${idx}]<${tag}`;
                if (attrStr) line += ` ${attrStr}`;
                if (text) line += `>${text}`;
                line += ' />';
                
                lines.push(line);
            }
        }
        
        return lines.join('\\n');
    }
    
    function getPageInfo() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = document.documentElement.scrollWidth;
        const ph = document.documentElement.scrollHeight;
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;
        
        const pixelsAbove = scrollY;
        const pixelsBelow = Math.max(0, ph - vh - scrollY);
        const pagesAbove = pixelsAbove / vh;
        const pagesBelow = pixelsBelow / vh;
        
        return {
            viewport_width: vw,
            viewport_height: vh,
            page_width: pw,
            page_height: ph,
            pixels_above: pixelsAbove,
            pixels_below: pixelsBelow,
            pages_above: pagesAbove,
            pages_below: pagesBelow,
            scroll_x: scrollX,
            scroll_y: scrollY
        };
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PageAgent Actions
    // ═══════════════════════════════════════════════════════════════════════════
    
    async function waitFor(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    function getElementByIndex(index) {
        const el = selectorMap.get(index);
        if (!el) throw new Error(`No element at index ${index}`);
        if (!(el instanceof HTMLElement)) throw new Error(`Element at index ${index} is not HTMLElement`);
        return el;
    }
    
    async function scrollIntoViewIfNeeded(el) {
        const rect = el.getBoundingClientRect();
        const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!inView) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await waitFor(300);
        }
    }
    
    async function clickElement(index) {
        try {
            const el = getElementByIndex(index);
            await scrollIntoViewIfNeeded(el);
            
            // Dispatch mouse events
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            el.focus();
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            
            await waitFor(200);
            
            return { success: true, message: `Clicked element [${index}]` };
        } catch (e) {
            return { success: false, message: `Failed to click: ${e.message}` };
        }
    }
    
    async function inputText(index, text) {
        try {
            const el = getElementByIndex(index);
            await scrollIntoViewIfNeeded(el);
            
            // Click to focus
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            el.focus();
            await waitFor(100);
            
            // Use native value setter for better React/Vue compatibility
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set;
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            )?.set;
            
            // Clear existing value first
            if (el instanceof HTMLInputElement && nativeInputValueSetter) {
                nativeInputValueSetter.call(el, '');
            } else if (el instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
                nativeTextAreaValueSetter.call(el, '');
            } else if (el.isContentEditable) {
                el.innerText = '';
            } else {
                el.value = '';
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            await waitFor(50);
            
            // Set new value using native setter
            if (el instanceof HTMLInputElement && nativeInputValueSetter) {
                nativeInputValueSetter.call(el, text);
            } else if (el instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
                nativeTextAreaValueSetter.call(el, text);
            } else if (el.isContentEditable) {
                el.innerText = text;
            } else {
                el.value = text;
            }
            
            // Dispatch events to trigger React/Vue state updates
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Also dispatch keyboard events for better compatibility
            el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            
            await waitFor(100);
            
            // Verify the value was set correctly
            const actualValue = el.value || el.innerText || '';
            if (actualValue !== text) {
                return { 
                    success: false, 
                    message: `Input verification failed: expected "${text}" but got "${actualValue}"`,
                    needs_vision_fallback: true
                };
            }
            
            return { success: true, message: `Input "${text}" into element [${index}]` };
        } catch (e) {
            return { success: false, message: `Failed to input: ${e.message}`, needs_vision_fallback: true };
        }
    }
    
    async function selectOption(index, optionText) {
        try {
            const el = getElementByIndex(index);
            
            if (!(el instanceof HTMLSelectElement)) {
                throw new Error('Element is not a select');
            }
            
            const options = Array.from(el.options);
            const option = options.find(o => o.textContent.trim() === optionText.trim());
            
            if (!option) {
                throw new Error(`Option "${optionText}" not found`);
            }
            
            el.value = option.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            
            await waitFor(100);
            
            return { success: true, message: `Selected "${optionText}" in element [${index}]` };
        } catch (e) {
            return { success: false, message: `Failed to select: ${e.message}` };
        }
    }
    
    async function scrollPage(direction, amount) {
        try {
            const dy = direction === 'down' ? amount : -amount;
            window.scrollBy({ top: dy, behavior: 'smooth' });
            await waitFor(300);
            
            return { success: true, message: `Scrolled ${direction} by ${amount}px` };
        } catch (e) {
            return { success: false, message: `Failed to scroll: ${e.message}` };
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Public API
    // ═══════════════════════════════════════════════════════════════════════════
    
    window.AetherPageAgent = {
        async getBrowserState() {
            const url = window.location.href;
            const title = document.title;
            const pageInfo = getPageInfo();
            const content = buildIndexedDOM();
            
            const header = `Current Page: [${title}](${url})
Page info: ${pageInfo.viewport_width}x${pageInfo.viewport_height}px viewport, ${pageInfo.page_width}x${pageInfo.page_height}px total
Scroll position: ${pageInfo.scroll_y}px down (${pageInfo.pages_above.toFixed(1)} pages above, ${pageInfo.pages_below.toFixed(1)} pages below)

Interactive elements:`;
            
            const footer = pageInfo.pixels_below > 10 
                ? `... ${Math.round(pageInfo.pixels_below)}px more below - scroll to see more ...`
                : '[End of page]';
            
            return { url, title, header, content, footer, elementCount: selectorMap.size };
        },
        
        async click(index) {
            return await clickElement(index);
        },
        
        async input(index, text) {
            return await inputText(index, text);
        },
        
        async select(index, optionText) {
            return await selectOption(index, optionText);
        },
        
        async scroll(direction, amount = 500) {
            return await scrollPage(direction, amount);
        },
        
        getElementCount() {
            return selectorMap.size;
        }
    };
    
    console.log('[AetherTest] PageAgent bridge injected successfully');
})();
"""

# ── CDP Helper Functions ──────────────────────────────────────────────────────

async def _get_cdp_page_ws() -> Optional[str]:
    """Get WebSocket URL for the active page target via CDP."""
    import httpx
    
    cdp_base = settings.browser_sandbox_cdp
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{cdp_base}/json")
            resp.raise_for_status()
            targets = resp.json()
        
        page_target = next((t for t in targets if t.get("type") == "page"), None)
        if page_target:
            return page_target["webSocketDebuggerUrl"]
        return None
    except Exception as e:
        logger.error(f"Failed to get CDP page target: {e}")
        return None


async def _cdp_evaluate(script: str) -> dict:
    """Execute JavaScript in the browser via CDP and return result."""
    import websockets
    
    ws_url = await _get_cdp_page_ws()
    if not ws_url:
        return {"success": False, "error": "No page target available"}
    
    try:
        async with websockets.connect(ws_url) as ws:
            # Wrap script in async IIFE for await support
            wrapped = f"(async () => {{ {script} }})()"
            
            await ws.send(json.dumps({
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": wrapped,
                    "awaitPromise": True,
                    "returnByValue": True
                }
            }))
            
            resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            
            result = resp.get("result", {}).get("result", {})
            if result.get("type") == "object":
                return {"success": True, "data": result.get("value", {})}
            elif result.get("type") == "undefined":
                return {"success": True, "data": None}
            else:
                return {"success": True, "data": result.get("value")}
                
    except Exception as e:
        logger.error(f"CDP evaluate failed: {e}")
        return {"success": False, "error": str(e)}


async def inject_pageagent() -> dict:
    """Inject PageAgent script into the current page."""
    logger.info("Injecting PageAgent into browser...")
    
    result = await _cdp_evaluate(f"""
        {PAGEAGENT_INJECTION_SCRIPT}
        return {{ injected: true }};
    """)
    
    if result.get("success"):
        logger.info("PageAgent injected successfully")
    else:
        logger.error(f"PageAgent injection failed: {result.get('error')}")
    
    return result


async def get_page_state() -> dict:
    """Get current page state with indexed interactive elements."""
    await inject_pageagent()
    
    result = await _cdp_evaluate("""
        if (!window.AetherPageAgent) {
            return { error: 'PageAgent not available' };
        }
        return await window.AetherPageAgent.getBrowserState();
    """)
    
    if result.get("success"):
        data = result.get("data", {})
        if isinstance(data, dict) and "content" in data:
            logger.info(f"Page state retrieved: {data.get('elementCount', 0)} elements indexed")
            return {"success": True, **data}
        elif isinstance(data, dict) and "error" in data:
            return {"success": False, "error": data["error"]}
    
    return {"success": False, "error": result.get("error", "Unknown error")}


async def click_element(index: int) -> dict:
    """Click an element by its index."""
    await inject_pageagent()
    
    result = await _cdp_evaluate(f"""
        if (!window.AetherPageAgent) {{
            return {{ success: false, message: 'PageAgent not available' }};
        }}
        return await window.AetherPageAgent.click({index});
    """)
    
    if result.get("success"):
        data = result.get("data", {})
        logger.info(f"Click element [{index}]: {data.get('message', 'done')}")
        return data
    
    return {"success": False, "message": result.get("error", "Click failed")}


async def input_text(index: int, text: str) -> dict:
    """Input text into an element by its index."""
    await inject_pageagent()
    
    escaped_text = text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
    
    result = await _cdp_evaluate(f"""
        if (!window.AetherPageAgent) {{
            return {{ success: false, message: 'PageAgent not available' }};
        }}
        return await window.AetherPageAgent.input({index}, "{escaped_text}");
    """)
    
    if result.get("success"):
        data = result.get("data", {})
        logger.info(f"Input text [{index}]: {data.get('message', 'done')}")
        return data
    
    return {"success": False, "message": result.get("error", "Input failed")}


async def select_option(index: int, option_text: str) -> dict:
    """Select a dropdown option by element index and option text."""
    await inject_pageagent()
    
    escaped_text = option_text.replace('\\', '\\\\').replace('"', '\\"')
    
    result = await _cdp_evaluate(f"""
        if (!window.AetherPageAgent) {{
            return {{ success: false, message: 'PageAgent not available' }};
        }}
        return await window.AetherPageAgent.select({index}, "{escaped_text}");
    """)
    
    if result.get("success"):
        data = result.get("data", {})
        logger.info(f"Select option [{index}]: {data.get('message', 'done')}")
        return data
    
    return {"success": False, "message": result.get("error", "Select failed")}


async def scroll_page(direction: str = "down", amount: int = 500) -> dict:
    """Scroll the page in a direction."""
    await inject_pageagent()
    
    result = await _cdp_evaluate(f"""
        if (!window.AetherPageAgent) {{
            return {{ success: false, message: 'PageAgent not available' }};
        }}
        return await window.AetherPageAgent.scroll("{direction}", {amount});
    """)
    
    if result.get("success"):
        data = result.get("data", {})
        logger.info(f"Scroll {direction}: {data.get('message', 'done')}")
        return data
    
    return {"success": False, "message": result.get("error", "Scroll failed")}


# ── Tool Definitions ──────────────────────────────────────────────────────────

def get_page_state_tool_definition() -> dict:
    return {
        "name": "get_page_state",
        "description": (
            "Get the current page state with all interactive elements indexed. "
            "Returns a list of elements like [0]<button>Login</button>, [1]<input placeholder='Email'>. "
            "Use the index numbers with click_element, input_text, or select_option to interact."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    }


def get_click_element_tool_definition() -> dict:
    return {
        "name": "click_element",
        "description": (
            "Click an interactive element by its index number from get_page_state. "
            "Example: click_element(index=0) clicks the first interactive element. "
            "If PageAgent fails, automatically falls back to vision-based clicking."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "index": {
                    "type": "integer",
                    "description": "The index number of the element to click (from get_page_state output)"
                },
                "element_description": {
                    "type": "string",
                    "description": "Optional: Human-readable description of the element (e.g., 'Login button', 'Submit form'). Used for vision fallback if PageAgent fails."
                }
            },
            "required": ["index"],
        },
    }


def get_input_text_tool_definition() -> dict:
    return {
        "name": "input_text",
        "description": (
            "Type text into an input field by its index number from get_page_state. "
            "Example: input_text(index=1, text='user@example.com'). "
            "If PageAgent fails, automatically falls back to vision-based input."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "index": {
                    "type": "integer",
                    "description": "The index number of the input field"
                },
                "text": {
                    "type": "string",
                    "description": "The text to type into the field"
                },
                "element_description": {
                    "type": "string",
                    "description": "Optional: Human-readable description of the field (e.g., 'email input', 'password field'). Used for vision fallback if PageAgent fails."
                }
            },
            "required": ["index", "text"],
        },
    }


def get_select_option_tool_definition() -> dict:
    return {
        "name": "select_option",
        "description": (
            "Select an option from a dropdown by element index and option text. "
            "Example: select_option(index=5, option_text='United States'). "
            "If PageAgent fails, automatically falls back to vision-based selection."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "index": {
                    "type": "integer",
                    "description": "The index number of the select element"
                },
                "option_text": {
                    "type": "string",
                    "description": "The visible text of the option to select"
                },
                "element_description": {
                    "type": "string",
                    "description": "Optional: Human-readable description of the dropdown (e.g., 'country selector', 'language dropdown'). Used for vision fallback if PageAgent fails."
                }
            },
            "required": ["index", "option_text"],
        },
    }


def get_scroll_page_tool_definition() -> dict:
    return {
        "name": "scroll_page",
        "description": (
            "Scroll the page up or down to reveal more content. "
            "Use after get_page_state shows there's more content above/below."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "direction": {
                    "type": "string",
                    "enum": ["up", "down"],
                    "description": "Direction to scroll"
                },
                "amount": {
                    "type": "integer",
                    "description": "Pixels to scroll (default: 500)",
                    "default": 500
                }
            },
            "required": ["direction"],
        },
    }


# ── Tool Handlers ─────────────────────────────────────────────────────────────

async def handle_get_page_state(tool_input: dict) -> dict:
    result = await get_page_state()
    return {"type": "tool_result", "content": json.dumps(result)}


async def handle_click_element(tool_input: dict) -> dict:
    index = tool_input.get("index", 0)
    result = await click_element(index)
    return {"type": "tool_result", "content": json.dumps(result)}


async def handle_input_text(tool_input: dict) -> dict:
    index = tool_input.get("index", 0)
    text = tool_input.get("text", "")
    result = await input_text(index, text)
    return {"type": "tool_result", "content": json.dumps(result)}


async def handle_select_option(tool_input: dict) -> dict:
    index = tool_input.get("index", 0)
    option_text = tool_input.get("option_text", "")
    result = await select_option(index, option_text)
    return {"type": "tool_result", "content": json.dumps(result)}


async def handle_scroll_page(tool_input: dict) -> dict:
    direction = tool_input.get("direction", "down")
    amount = tool_input.get("amount", 500)
    result = await scroll_page(direction, amount)
    return {"type": "tool_result", "content": json.dumps(result)}
