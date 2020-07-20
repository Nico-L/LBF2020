var appInscription = (function (exports) {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_custom_element_data(node, prop, value) {
        if (prop in node) {
            node[prop] = value;
        }
        else {
            attr(node, prop, value);
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function validate_each_keys(ctx, list, get_context, get_key) {
        const keys = new Set();
        for (let i = 0; i < list.length; i++) {
            const key = get_key(get_context(ctx, list, i));
            if (keys.has(key)) {
                throw new Error(`Cannot have duplicate keys in a keyed each`);
            }
            keys.add(key);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    let SvelteElement;
    if (typeof HTMLElement === 'function') {
        SvelteElement = class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' });
            }
            connectedCallback() {
                // @ts-ignore todo: improve typings
                for (const key in this.$$.slotted) {
                    // @ts-ignore todo: improve typings
                    this.appendChild(this.$$.slotted[key]);
                }
            }
            attributeChangedCallback(attr, _oldValue, newValue) {
                this[attr] = newValue;
            }
            $destroy() {
                destroy_component(this, 1);
                this.$destroy = noop;
            }
            $on(type, callback) {
                // TODO should this delegate to addEventListener?
                const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
                callbacks.push(callback);
                return () => {
                    const index = callbacks.indexOf(callback);
                    if (index !== -1)
                        callbacks.splice(index, 1);
                };
            }
            $set() {
                // overridden by instance, if it has props
            }
        };
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.24.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }

    /* src/svelte/components/ModalPerso.svelte generated by Svelte v3.24.0 */
    const file = "src/svelte/components/ModalPerso.svelte";

    // (56:16) {#if has_bouton_bleu}
    function create_if_block(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*bouton_bleu_busy*/ ctx[1]) return create_if_block_1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			button = element("button");
    			if_block.c();
    			attr_dev(button, "class", "w-24 h-10 mx-1 px-1 border-2 border-bleuLBF rounded text-base font-medium text-bleuLBF");
    			add_location(button, file, 56, 20, 2229);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			if_block.m(button, null);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[6], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(button, null);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(56:16) {#if has_bouton_bleu}",
    		ctx
    	});

    	return block;
    }

    // (71:24) {:else}
    function create_else_block(ctx) {
    	let slot;

    	const block = {
    		c: function create() {
    			slot = element("slot");
    			slot.textContent = "BoutonBleu";
    			attr_dev(slot, "name", "boutonBleu");
    			attr_dev(slot, "class", "mx-auto");
    			add_location(slot, file, 71, 28, 3897);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, slot, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(slot);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(71:24) {:else}",
    		ctx
    	});

    	return block;
    }

    // (58:24) {#if bouton_bleu_busy}
    function create_if_block_1(ctx) {
    	let svg;
    	let g;
    	let circle0;
    	let animate0;
    	let animate1;
    	let circle1;
    	let animate2;
    	let animate3;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			g = svg_element("g");
    			circle0 = svg_element("circle");
    			animate0 = svg_element("animate");
    			animate1 = svg_element("animate");
    			circle1 = svg_element("circle");
    			animate2 = svg_element("animate");
    			animate3 = svg_element("animate");
    			attr_dev(animate0, "attributeName", "r");
    			attr_dev(animate0, "begin", "0s");
    			attr_dev(animate0, "dur", "1.8s");
    			attr_dev(animate0, "values", "1; 20");
    			attr_dev(animate0, "calcMode", "spline");
    			attr_dev(animate0, "keyTimes", "0; 1");
    			attr_dev(animate0, "keySplines", "0.165, 0.84, 0.44, 1");
    			attr_dev(animate0, "repeatCount", "indefinite");
    			add_location(animate0, file, 61, 40, 2812);
    			attr_dev(animate1, "attributeName", "stroke-opacity");
    			attr_dev(animate1, "begin", "0s");
    			attr_dev(animate1, "dur", "1.8s");
    			attr_dev(animate1, "values", "1; 0");
    			attr_dev(animate1, "calcMode", "spline");
    			attr_dev(animate1, "keyTimes", "0; 1");
    			attr_dev(animate1, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate1, "repeatCount", "indefinite");
    			add_location(animate1, file, 62, 40, 3012);
    			attr_dev(circle0, "cx", "22");
    			attr_dev(circle0, "cy", "22");
    			attr_dev(circle0, "r", "1");
    			add_location(circle0, file, 60, 36, 2740);
    			attr_dev(animate2, "attributeName", "r");
    			attr_dev(animate2, "begin", "-0.9s");
    			attr_dev(animate2, "dur", "1.8s");
    			attr_dev(animate2, "values", "1; 20");
    			attr_dev(animate2, "calcMode", "spline");
    			attr_dev(animate2, "keyTimes", "0; 1");
    			attr_dev(animate2, "keySplines", "0.165, 0.84, 0.44, 1");
    			attr_dev(animate2, "repeatCount", "indefinite");
    			add_location(animate2, file, 65, 40, 3338);
    			attr_dev(animate3, "attributeName", "stroke-opacity");
    			attr_dev(animate3, "begin", "-0.9s");
    			attr_dev(animate3, "dur", "1.8s");
    			attr_dev(animate3, "values", "1; 0");
    			attr_dev(animate3, "calcMode", "spline");
    			attr_dev(animate3, "keyTimes", "0; 1");
    			attr_dev(animate3, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate3, "repeatCount", "indefinite");
    			add_location(animate3, file, 66, 40, 3541);
    			attr_dev(circle1, "cx", "22");
    			attr_dev(circle1, "cy", "22");
    			attr_dev(circle1, "r", "1");
    			add_location(circle1, file, 64, 36, 3266);
    			attr_dev(g, "fill", "none");
    			attr_dev(g, "fill-rule", "evenodd");
    			attr_dev(g, "stroke-width", "2");
    			add_location(g, file, 59, 32, 2650);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "class", "fill-current stroke-current text-bleuLBF-500 bg-bleuLBF-500 h-8 w-8 mx-auto mt-1");
    			attr_dev(svg, "viewBox", "0 0 50 50");
    			add_location(svg, file, 58, 28, 2467);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, g);
    			append_dev(g, circle0);
    			append_dev(circle0, animate0);
    			append_dev(circle0, animate1);
    			append_dev(g, circle1);
    			append_dev(circle1, animate2);
    			append_dev(circle1, animate3);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(58:24) {#if bouton_bleu_busy}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div4;
    	let div0;
    	let t0;
    	let div3;
    	let h2;
    	let slot0;
    	let t2;
    	let div1;
    	let slot1;
    	let t4;
    	let div2;
    	let button;
    	let slot2;
    	let t6;
    	let mounted;
    	let dispose;
    	let if_block = /*has_bouton_bleu*/ ctx[0] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div3 = element("div");
    			h2 = element("h2");
    			slot0 = element("slot");
    			slot0.textContent = "Un titre";
    			t2 = space();
    			div1 = element("div");
    			slot1 = element("slot");
    			slot1.textContent = "Le corps de la fenêtre";
    			t4 = space();
    			div2 = element("div");
    			button = element("button");
    			slot2 = element("slot");
    			slot2.textContent = "Fermer";
    			t6 = space();
    			if (if_block) if_block.c();
    			this.c = noop;
    			attr_dev(div0, "class", "absolute w-full h-full bg-black opacity-75 top-0 left-0 cursor-pointer");
    			add_location(div0, file, 45, 4, 1432);
    			attr_dev(slot0, "name", "titre");
    			add_location(slot0, file, 48, 16, 1767);
    			attr_dev(h2, "class", "text-xl w-full pb-1 mb-1 border-b-2 border-bleuLBF font-bold");
    			add_location(h2, file, 47, 12, 1676);
    			add_location(slot1, file, 50, 30, 1852);
    			attr_dev(div1, "class", "mx-2");
    			add_location(div1, file, 50, 12, 1834);
    			attr_dev(slot2, "name", "boutonDefaut");
    			add_location(slot2, file, 53, 20, 2102);
    			attr_dev(button, "class", "mx-1 px-1 border-2 border-orangeLBF rounded text-base font-medium text-orangeLBF");
    			add_location(button, file, 52, 16, 1966);
    			attr_dev(div2, "class", "flex justify-end mt-3 mx-2");
    			add_location(div2, file, 51, 12, 1908);
    			attr_dev(div3, "class", "max-w-5/6 relative overflow-auto bg-white p-2 rounded");
    			attr_dev(div3, "role", "dialog");
    			attr_dev(div3, "aria-modal", "true");
    			add_location(div3, file, 46, 4, 1545);
    			attr_dev(div4, "class", "z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center");
    			add_location(div4, file, 44, 0, 1341);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div0);
    			append_dev(div4, t0);
    			append_dev(div4, div3);
    			append_dev(div3, h2);
    			append_dev(h2, slot0);
    			append_dev(div3, t2);
    			append_dev(div3, div1);
    			append_dev(div1, slot1);
    			append_dev(div3, t4);
    			append_dev(div3, div2);
    			append_dev(div2, button);
    			append_dev(button, slot2);
    			append_dev(div2, t6);
    			if (if_block) if_block.m(div2, null);
    			/*div3_binding*/ ctx[7](div3);

    			if (!mounted) {
    				dispose = [
    					listen_dev(window, "keydown", /*handle_keydown*/ ctx[5], false, false, false),
    					listen_dev(div0, "click", /*close*/ ctx[3], false, false, false),
    					listen_dev(button, "click", /*close*/ ctx[3], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*has_bouton_bleu*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(div2, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			if (if_block) if_block.d();
    			/*div3_binding*/ ctx[7](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { has_bouton_bleu = false } = $$props;
    	let { bouton_bleu_busy = false } = $$props;
    	var actionEncours = false;

    	//const dispatch = createEventDispatcher();
    	const component = get_current_component();

    	const svelteDispatch = createEventDispatcher();

    	const dispatch = (name, detail) => {
    		svelteDispatch(name, detail);
    		component.dispatchEvent && component.dispatchEvent(new CustomEvent(name, { detail }));
    	};

    	const close = () => dispatch("close");
    	const boutonBleu = () => dispatch("boutonBleu");
    	let modal;

    	const handle_keydown = e => {
    		if (e.key === "Escape") {
    			close();
    			return;
    		}

    		if (e.key === "Tab") {
    			// trap focus
    			const nodes = modal.querySelectorAll("*");

    			const tabbable = Array.from(nodes).filter(n => n.tabIndex >= 0);
    			let index = tabbable.indexOf(document.activeElement);
    			if (index === -1 && e.shiftKey) index = 0;
    			index += tabbable.length + (e.shiftKey ? -1 : 1);
    			index %= tabbable.length;
    			tabbable[index].focus();
    			e.preventDefault();
    		}
    	};

    	const writable_props = ["has_bouton_bleu", "bouton_bleu_busy"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<mon-modal> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("mon-modal", $$slots, []);

    	const click_handler = () => {
    		if (!bouton_bleu_busy) {
    			boutonBleu();
    		}
    	};

    	function div3_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			modal = $$value;
    			$$invalidate(2, modal);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("has_bouton_bleu" in $$props) $$invalidate(0, has_bouton_bleu = $$props.has_bouton_bleu);
    		if ("bouton_bleu_busy" in $$props) $$invalidate(1, bouton_bleu_busy = $$props.bouton_bleu_busy);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		onDestroy,
    		onMount,
    		tick,
    		get_current_component,
    		has_bouton_bleu,
    		bouton_bleu_busy,
    		actionEncours,
    		component,
    		svelteDispatch,
    		dispatch,
    		close,
    		boutonBleu,
    		modal,
    		handle_keydown
    	});

    	$$self.$inject_state = $$props => {
    		if ("has_bouton_bleu" in $$props) $$invalidate(0, has_bouton_bleu = $$props.has_bouton_bleu);
    		if ("bouton_bleu_busy" in $$props) $$invalidate(1, bouton_bleu_busy = $$props.bouton_bleu_busy);
    		if ("actionEncours" in $$props) actionEncours = $$props.actionEncours;
    		if ("modal" in $$props) $$invalidate(2, modal = $$props.modal);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		has_bouton_bleu,
    		bouton_bleu_busy,
    		modal,
    		close,
    		boutonBleu,
    		handle_keydown,
    		click_handler,
    		div3_binding
    	];
    }

    class ModalPerso extends SvelteElement {
    	constructor(options) {
    		super();
    		this.shadowRoot.innerHTML = `<style>button{font-family:inherit;font-size:100%;line-height:1.15;margin:0}button{overflow:visible}button{text-transform:none}button{-webkit-appearance:button}button::-moz-focus-inner{border-style:none;padding:0}button:-moz-focusring{outline:1px dotted ButtonText}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}h2{margin:0}button{background-color:transparent;background-image:none}button:focus{outline:1px dotted;outline:5px auto -webkit-focus-ring-color}*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e2e8f0}button{cursor:pointer}h2{font-size:inherit;font-weight:inherit}button{padding:0;line-height:inherit;color:inherit}svg{display:block;vertical-align:middle}@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}@media not print{}@media print and (-ms-high-contrast: active), print and (-ms-high-contrast: none){}@media not print{}@media not print{}.space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.divide-transparent>:not(template)~:not(template){border-color:transparent}.divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}.bg-black{--bg-opacity:1;background-color:#000;background-color:rgba(0, 0, 0, var(--bg-opacity))}.bg-white{--bg-opacity:1;background-color:#fff;background-color:rgba(255, 255, 255, var(--bg-opacity))}.border-orangeLBF{--border-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--border-opacity))}.border-bleuLBF{--border-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--border-opacity))}.rounded{border-radius:0.25rem}.border-2{border-width:2px}.border-b-2{border-bottom-width:2px}.cursor-pointer{cursor:pointer}.flex{display:flex}.items-center{align-items:center}.justify-end{justify-content:flex-end}.justify-center{justify-content:center}.font-medium{font-weight:500}.font-bold{font-weight:700}.h-8{height:2rem}.h-10{height:2.5rem}.h-full{height:100%}.text-base{font-size:1rem}.text-xl{font-size:1.25rem}.mx-1{margin-left:0.25rem;margin-right:0.25rem}.mx-2{margin-left:0.5rem;margin-right:0.5rem}.mx-auto{margin-left:auto;margin-right:auto}.mt-1{margin-top:0.25rem}.mb-1{margin-bottom:0.25rem}.mt-3{margin-top:0.75rem}.max-w-5\\/6{max-width:83%}.opacity-75{opacity:0.75}.overflow-auto{overflow:auto}.p-2{padding:0.5rem}.px-1{padding-left:0.25rem;padding-right:0.25rem}.pb-1{padding-bottom:0.25rem}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.top-0{top:0}.left-0{left:0}.fill-current{fill:currentColor}.stroke-current{stroke:currentColor}.text-orangeLBF{--text-opacity:1;color:#ee732e;color:rgba(238, 115, 46, var(--text-opacity))}.text-bleuLBF{--text-opacity:1;color:#4bbcc4;color:rgba(75, 188, 196, var(--text-opacity))}.w-8{width:2rem}.w-24{width:6rem}.w-full{width:100%}.z-100{z-index:100}@media(min-width: 640px){@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}.sm\\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.sm\\:space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.sm\\:space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.sm\\:space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.sm\\:space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.sm\\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.sm\\:space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.sm\\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.sm\\:space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.sm\\:space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.sm\\:space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.sm\\:space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.sm\\:space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.sm\\:space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.sm\\:space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.sm\\:space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.sm\\:space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.sm\\:space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.sm\\:space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.sm\\:space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.sm\\:space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.sm\\:space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.sm\\:space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.sm\\:space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.sm\\:space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.sm\\:space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.sm\\:space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.sm\\:space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.sm\\:space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.sm\\:space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.sm\\:space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.sm\\:-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.sm\\:-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.sm\\:-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.sm\\:-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.sm\\:-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.sm\\:-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.sm\\:-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.sm\\:-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.sm\\:-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.sm\\:-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.sm\\:-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.sm\\:-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.sm\\:-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.sm\\:-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.sm\\:-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.sm\\:-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.sm\\:-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.sm\\:-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.sm\\:-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.sm\\:-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.sm\\:-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.sm\\:-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.sm\\:-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.sm\\:-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.sm\\:-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.sm\\:-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.sm\\:-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.sm\\:-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.sm\\:-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.sm\\:space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.sm\\:divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.sm\\:divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.sm\\:divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.sm\\:divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.sm\\:divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.sm\\:divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.sm\\:divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.sm\\:divide-transparent>:not(template)~:not(template){border-color:transparent}.sm\\:divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.sm\\:divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.sm\\:divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.sm\\:divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.sm\\:divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.sm\\:divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.sm\\:divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.sm\\:divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.sm\\:divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.sm\\:divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.sm\\:divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.sm\\:divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.sm\\:divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.sm\\:divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.sm\\:divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.sm\\:divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.sm\\:divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.sm\\:divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.sm\\:divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.sm\\:divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.sm\\:divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.sm\\:divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.sm\\:divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.sm\\:divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.sm\\:divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.sm\\:divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.sm\\:divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.sm\\:divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.sm\\:divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.sm\\:divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.sm\\:divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.sm\\:divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.sm\\:divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.sm\\:divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.sm\\:divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.sm\\:divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.sm\\:divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.sm\\:divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.sm\\:divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.sm\\:divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.sm\\:divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.sm\\:divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.sm\\:divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.sm\\:divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.sm\\:divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.sm\\:divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.sm\\:divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.sm\\:divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.sm\\:divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.sm\\:divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.sm\\:divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.sm\\:divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.sm\\:divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.sm\\:divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.sm\\:divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.sm\\:divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.sm\\:divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.sm\\:divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.sm\\:divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.sm\\:divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.sm\\:divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.sm\\:divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.sm\\:divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.sm\\:divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.sm\\:divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.sm\\:divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.sm\\:divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.sm\\:divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.sm\\:divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.sm\\:divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.sm\\:divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.sm\\:divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.sm\\:divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}}@media(min-width: 768px){@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}.md\\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.md\\:space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.md\\:space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.md\\:space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.md\\:space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.md\\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.md\\:space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.md\\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.md\\:space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.md\\:space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.md\\:space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.md\\:space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.md\\:space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.md\\:space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.md\\:space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.md\\:space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.md\\:space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.md\\:space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.md\\:space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.md\\:space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.md\\:space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.md\\:space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.md\\:space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.md\\:space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.md\\:space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.md\\:space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.md\\:space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.md\\:space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.md\\:space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.md\\:space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.md\\:space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.md\\:-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.md\\:-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.md\\:-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.md\\:-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.md\\:-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.md\\:-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.md\\:-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.md\\:-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.md\\:-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.md\\:-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.md\\:-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.md\\:-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.md\\:-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.md\\:-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.md\\:-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.md\\:-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.md\\:-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.md\\:-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.md\\:-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.md\\:-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.md\\:-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.md\\:-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.md\\:-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.md\\:-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.md\\:-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.md\\:-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.md\\:-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.md\\:-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.md\\:-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.md\\:space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.md\\:divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.md\\:divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.md\\:divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.md\\:divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.md\\:divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.md\\:divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.md\\:divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.md\\:divide-transparent>:not(template)~:not(template){border-color:transparent}.md\\:divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.md\\:divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.md\\:divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.md\\:divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.md\\:divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.md\\:divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.md\\:divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.md\\:divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.md\\:divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.md\\:divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.md\\:divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.md\\:divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.md\\:divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.md\\:divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.md\\:divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.md\\:divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.md\\:divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.md\\:divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.md\\:divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.md\\:divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.md\\:divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.md\\:divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.md\\:divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.md\\:divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.md\\:divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.md\\:divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.md\\:divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.md\\:divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.md\\:divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.md\\:divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.md\\:divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.md\\:divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.md\\:divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.md\\:divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.md\\:divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.md\\:divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.md\\:divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.md\\:divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.md\\:divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.md\\:divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.md\\:divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.md\\:divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.md\\:divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.md\\:divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.md\\:divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.md\\:divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.md\\:divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.md\\:divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.md\\:divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.md\\:divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.md\\:divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.md\\:divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.md\\:divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.md\\:divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.md\\:divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.md\\:divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.md\\:divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.md\\:divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.md\\:divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.md\\:divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.md\\:divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.md\\:divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.md\\:divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.md\\:divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.md\\:divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.md\\:divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.md\\:divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.md\\:divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.md\\:divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.md\\:divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.md\\:divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.md\\:divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.md\\:divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}}@media(min-width: 1024px){@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}.lg\\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.lg\\:space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.lg\\:space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.lg\\:space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.lg\\:space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.lg\\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.lg\\:space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.lg\\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.lg\\:space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.lg\\:space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.lg\\:space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.lg\\:space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.lg\\:space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.lg\\:space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.lg\\:space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.lg\\:space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.lg\\:space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.lg\\:space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.lg\\:space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.lg\\:space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.lg\\:space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.lg\\:space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.lg\\:space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.lg\\:space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.lg\\:space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.lg\\:space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.lg\\:space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.lg\\:space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.lg\\:space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.lg\\:space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.lg\\:space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.lg\\:-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.lg\\:-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.lg\\:-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.lg\\:-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.lg\\:-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.lg\\:-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.lg\\:-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.lg\\:-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.lg\\:-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.lg\\:-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.lg\\:-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.lg\\:-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.lg\\:-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.lg\\:-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.lg\\:-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.lg\\:-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.lg\\:-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.lg\\:-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.lg\\:-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.lg\\:-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.lg\\:-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.lg\\:-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.lg\\:-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.lg\\:-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.lg\\:-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.lg\\:-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.lg\\:-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.lg\\:-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.lg\\:-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.lg\\:space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.lg\\:divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.lg\\:divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.lg\\:divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.lg\\:divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.lg\\:divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.lg\\:divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.lg\\:divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.lg\\:divide-transparent>:not(template)~:not(template){border-color:transparent}.lg\\:divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.lg\\:divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.lg\\:divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.lg\\:divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.lg\\:divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.lg\\:divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.lg\\:divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.lg\\:divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.lg\\:divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.lg\\:divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.lg\\:divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.lg\\:divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.lg\\:divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.lg\\:divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.lg\\:divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.lg\\:divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.lg\\:divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.lg\\:divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.lg\\:divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.lg\\:divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.lg\\:divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.lg\\:divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.lg\\:divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.lg\\:divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.lg\\:divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.lg\\:divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.lg\\:divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.lg\\:divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.lg\\:divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.lg\\:divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.lg\\:divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.lg\\:divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.lg\\:divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.lg\\:divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.lg\\:divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.lg\\:divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.lg\\:divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.lg\\:divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.lg\\:divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.lg\\:divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.lg\\:divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.lg\\:divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.lg\\:divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.lg\\:divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.lg\\:divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.lg\\:divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.lg\\:divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.lg\\:divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.lg\\:divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.lg\\:divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.lg\\:divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.lg\\:divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.lg\\:divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.lg\\:divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.lg\\:divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.lg\\:divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.lg\\:divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.lg\\:divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.lg\\:divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.lg\\:divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.lg\\:divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.lg\\:divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.lg\\:divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.lg\\:divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.lg\\:divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.lg\\:divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.lg\\:divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.lg\\:divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.lg\\:divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.lg\\:divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.lg\\:divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.lg\\:divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.lg\\:divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}}@media(min-width: 1280px){@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}.xl\\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.xl\\:space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.xl\\:space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.xl\\:space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.xl\\:space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.xl\\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.xl\\:space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.xl\\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.xl\\:space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.xl\\:space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.xl\\:space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.xl\\:space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.xl\\:space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.xl\\:space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.xl\\:space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.xl\\:space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.xl\\:space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.xl\\:space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.xl\\:space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.xl\\:space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.xl\\:space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.xl\\:space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.xl\\:space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.xl\\:space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.xl\\:space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.xl\\:space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.xl\\:space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.xl\\:space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.xl\\:space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.xl\\:space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.xl\\:space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.xl\\:-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.xl\\:-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.xl\\:-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.xl\\:-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.xl\\:-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.xl\\:-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.xl\\:-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.xl\\:-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.xl\\:-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.xl\\:-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.xl\\:-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.xl\\:-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.xl\\:-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.xl\\:-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.xl\\:-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.xl\\:-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.xl\\:-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.xl\\:-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.xl\\:-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.xl\\:-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.xl\\:-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.xl\\:-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.xl\\:-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.xl\\:-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.xl\\:-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.xl\\:-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.xl\\:-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.xl\\:-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.xl\\:-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.xl\\:space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.xl\\:divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.xl\\:divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.xl\\:divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.xl\\:divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.xl\\:divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.xl\\:divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.xl\\:divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.xl\\:divide-transparent>:not(template)~:not(template){border-color:transparent}.xl\\:divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.xl\\:divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.xl\\:divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.xl\\:divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.xl\\:divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.xl\\:divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.xl\\:divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.xl\\:divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.xl\\:divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.xl\\:divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.xl\\:divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.xl\\:divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.xl\\:divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.xl\\:divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.xl\\:divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.xl\\:divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.xl\\:divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.xl\\:divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.xl\\:divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.xl\\:divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.xl\\:divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.xl\\:divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.xl\\:divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.xl\\:divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.xl\\:divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.xl\\:divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.xl\\:divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.xl\\:divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.xl\\:divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.xl\\:divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.xl\\:divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.xl\\:divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.xl\\:divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.xl\\:divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.xl\\:divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.xl\\:divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.xl\\:divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.xl\\:divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.xl\\:divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.xl\\:divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.xl\\:divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.xl\\:divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.xl\\:divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.xl\\:divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.xl\\:divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.xl\\:divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.xl\\:divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.xl\\:divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.xl\\:divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.xl\\:divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.xl\\:divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.xl\\:divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.xl\\:divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.xl\\:divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.xl\\:divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.xl\\:divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.xl\\:divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.xl\\:divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.xl\\:divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.xl\\:divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.xl\\:divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.xl\\:divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.xl\\:divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.xl\\:divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.xl\\:divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.xl\\:divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.xl\\:divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.xl\\:divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.xl\\:divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.xl\\:divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.xl\\:divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.xl\\:divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.xl\\:divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}}</style>`;
    		init(this, { target: this.shadowRoot }, instance, create_fragment, safe_not_equal, { has_bouton_bleu: 0, bouton_bleu_busy: 1 });

    		if (options) {
    			if (options.target) {
    				insert_dev(options.target, this, options.anchor);
    			}

    			if (options.props) {
    				this.$set(options.props);
    				flush();
    			}
    		}
    	}

    	static get observedAttributes() {
    		return ["has_bouton_bleu", "bouton_bleu_busy"];
    	}

    	get has_bouton_bleu() {
    		return this.$$.ctx[0];
    	}

    	set has_bouton_bleu(has_bouton_bleu) {
    		this.$set({ has_bouton_bleu });
    		flush();
    	}

    	get bouton_bleu_busy() {
    		return this.$$.ctx[1];
    	}

    	set bouton_bleu_busy(bouton_bleu_busy) {
    		this.$set({ bouton_bleu_busy });
    		flush();
    	}
    }

    customElements.define("mon-modal", ModalPerso);

    async function getInscrits(email, idAtelier) {
        const lesInscrits = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
            method: "POST",
            cache: "no-cache",
            body: JSON.stringify({
              query: `query lesInscrits($email: String, $idAtelier: uuid) {
            __typename
            inscritsAteliers(where: {email: {_eq: $email}, atelierInscrit: {id: {_eq: $idAtelier}}}) {
              nom
              prenom
              id
            }
          }`,
              variables: {
                email: email,
                idAtelier: idAtelier
              }
            })
          }).then(async retour => {
                let resultat = await retour.json();
                return resultat.data.inscritsAteliers
          });
        return lesInscrits
    }

    async function ajoutInscrits(listeNouveauxInscrits) {
      const lesInscrits = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
        method: "POST",
        cache: "no-cache",
        body: JSON.stringify({
          query: `mutation ajoutInscrits($object: [inscritsAteliers_insert_input!]!) {
        __typename
        insert_inscritsAteliers(objects: $object) {
          affected_rows
          returning {
            id
          }
        }
      }`,
          variables: {
            object: listeNouveauxInscrits
          }
        })
      }).then(async retour => {
            let resultat = await retour.json();
      });
      return lesInscrits
    }

    async function effacerInscription(email, idAtelier) {
      const mutation = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
        method: "POST",
        cache: "no-cache",
        body: JSON.stringify({
          query: `mutation effacerInscription($email: String, $idAtelier: uuid) {
        __typename
        delete_inscritsAteliers(where: {email: {_eq: $email}, _and: {atelier: {_eq: $idAtelier}}}){
          affected_rows
        }
      }`,
          variables: {
            email: email,
            idAtelier: idAtelier
          }
        })
      }).then(async retour => {
            let resultat = await retour.json();
      });
      return mutation
    }

    async function effacerInscritById(idInscrit) {
      const mutation = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
        method: "POST",
        cache: "no-cache",
        body: JSON.stringify({
          query: `mutation effacerInscription($id: uuid) {
        __typename
        delete_inscritsAteliers(where: {id: {_eq: $id}}){
          affected_rows
        }
      }`,
          variables: {
            id: idInscrit
          }
        })
      }).then(async retour => {
            let resultat = await retour.json();
      });
      return mutation
    }

    async function nbInscrits(idAtelier) {
      const query = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
        method: "POST",
        cache: "no-cache",
        body: JSON.stringify({
          query: `query nbInscrits($idAtelier: uuid) {
        __typename
        inscritsAteliers_aggregate(where: {atelier: {_eq: $idAtelier}}) {
          aggregate {
            count(columns: id)
          }
        }
        ateliers(where: {id: {_eq: $idAtelier}}) {
          nbParticipants
        }
      }`,
          variables: {
            idAtelier: idAtelier
          }
        })
      }).then(async retour => {
            let resultat = await retour.json();
            var inscrits = resultat.data.inscritsAteliers_aggregate.aggregate.count;
            var nbPlaces = resultat.data.ateliers[0].nbParticipants;
            return nbPlaces-inscrits
      }).catch((error) => console.log('erreur', error));
      return query
    }

    var gestionInscriptions = /*#__PURE__*/Object.freeze({
        __proto__: null,
        getInscrits: getInscrits,
        ajoutInscrits: ajoutInscrits,
        effacerInscription: effacerInscription,
        effacerInscritById: effacerInscritById,
        nbInscrits: nbInscrits
    });

    /*async function getToken() {
        return fetch("https://graphql.labonnefabrique.fr/apollo", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            query: `query login {
                    siteLogin {
                        loginToken
                    }
                    }`
            })
        }).then(retour => retour.json())
        .then(resultat => {
            console.log('retour token', resultat)
            return resultat.data.siteLogin.loginToken
        }).catch((error)=>console.log('erreur getToken', error))
    } */

    function nbInscrits$1(idAtelier) {
        return fetch("https://graphql.labonnefabrique.fr/apollo", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `query places($idAtelier: String!) {
                atelierNbPlacesRestantes(
                    id: $idAtelier
                ) {
                    places
                }
                }`,
                variables: {
                    idAtelier: idAtelier,
                }
                })
            }).then((retour) => retour.json())
        .then((resultat) => {
            return resultat.data.atelierNbPlacesRestantes.places
        }).catch((error) => console.log('erreur', error))
    }

    function findOneInscrit(idAtelier, email) {
        return fetch("https://graphql.labonnefabrique.fr/apollo", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query unInscrit($idAtelier: String!, $email: String!) {
                findOneInscrit(
                    id: $idAtelier
                    email: $email
                ) {
                    inscrit
                }
                }`,
            variables: {
                idAtelier: idAtelier,
                email: email
            }
            })
        }).then((retour) => retour.json())
            .then( resultat => {
                return resultat.data.findOneInscrit.inscrit
            })
            .catch((error) => console.log('erreur', error))
    }

    function ajoutInscrits$1(inscription) {
        const dataInscription = JSON.stringify(inscription);
        return fetch("https://graphql.labonnefabrique.fr/apollo",{
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query ajoutInscrit($inscription: String!) {
                ajoutInscription(
                    inscription: $inscription
                ) {
                    idInscription
                }
                }`,
            variables: {
                inscription: dataInscription,
            }
            })
        }).then(retour => retour.json())
        .then((resultat) => {return resultat.data.ajoutInscription.idInscription})
        .catch((error) => console.log('erreur', error))
    }

    function effacerInscription$1(idInscription) {
        return fetch("https://graphql.labonnefabrique.fr/apollo", {
            method: "POST",
            headers:  { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                query effaceInscrit($idInscription: String!) {
                    effaceInscription(idInscription: $idInscription) {
                        inscription
                    }
                }
            `,
                variables: {
                    idInscription: idInscription
                }
            })
        }).then(retour => retour.json())
        .then((resultat)=> {console.log('retour effaceInscription',resultat); return resultat.data.effaceInscription.inscription})
        .catch((error) => console.log('erreur', error))
    }

    function modifInscription(idInscrit, inscription) {
        const dataInscription = JSON.stringify(inscription);
        return fetch("https://graphql.labonnefabrique.fr/apollo",{
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query modifInscrit($idInscription: String!, $inscription: String!) {
                modifInscription(
                    idInscription: $idInscription
                    inscription: $inscription
                ) {
                    idInscription
                }
                }`,
            variables: {
                idInscription: idInscrit,
                inscription: dataInscription
            }
            })
        }).then(retour => retour.json())
        .then((resultat) => {console.log('retour modifInscription',resultat); return resultat.data.ajoutInscription.inscription})
        .catch((error) => console.log('erreur', error))
    }

    var strapiInscriptions = /*#__PURE__*/Object.freeze({
        __proto__: null,
        nbInscrits: nbInscrits$1,
        findOneInscrit: findOneInscrit,
        ajoutInscrits: ajoutInscrits$1,
        effacerInscription: effacerInscription$1,
        modifInscription: modifInscription
    });

    async function envoiMail(arrayMails, infoMail) {
        const mutation = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
              method: "POST",
              body: JSON.stringify({
                query: `
                mutation envoiMail($email: [String!]!, $template: String) {
                    sendEmail(
                    from: "atelier@labonnefabrique.fr"
                    to: $email
                    templateId: "d-3db7863e710b491e89681ccdf840a9f4"
                    dynamic_template_data: $template
                    ) {
                    success
                    }
                }
                `,
                variables: {
                  email: arrayMails,
                  template: JSON.stringify(infoMail)
                }
              })
            }).then(async response => {
              let resultat = await response.json();
              console.log('retour envoi mail', resultat);
            });
            return true;
    }

    /* src/svelte/inscriptions/inscriptions.svelte generated by Svelte v3.24.0 */

    const { console: console_1, window: window_1 } = globals;
    const file$1 = "src/svelte/inscriptions/inscriptions.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[51] = list[i];
    	child_ctx[52] = list;
    	child_ctx[53] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[54] = list[i];
    	child_ctx[55] = list;
    	child_ctx[56] = i;
    	return child_ctx;
    }

    // (292:0) {#if showModalInscription}
    function create_if_block_5(ctx) {
    	let div8;
    	let div0;
    	let t0;
    	let div7;
    	let h2;
    	let t2;
    	let hr;
    	let t3;
    	let div1;
    	let t5;
    	let div6;
    	let div5;
    	let div3;
    	let div2;
    	let t7;
    	let input0;
    	let t8;
    	let div4;
    	let t9;
    	let t10;
    	let t11;
    	let label;
    	let input1;
    	let t12;
    	let t13;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*actionEncours*/ ctx[6]) return create_if_block_16;
    		if (!/*flagEmailVerifie*/ ctx[7]) return create_if_block_17;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type && current_block_type(ctx);
    	let if_block1 = /*flagEmailVide*/ ctx[11] && create_if_block_15(ctx);
    	let if_block2 = /*flagEmailInvalide*/ ctx[12] && create_if_block_14(ctx);

    	function select_block_type_1(ctx, dirty) {
    		if (!/*flagEmailVerifie*/ ctx[7]) return create_if_block_6;
    		if (/*nbPlaces*/ ctx[3] === 0 && /*listeInscrits*/ ctx[2].length === 0) return create_if_block_7;
    		return create_else_block$1;
    	}

    	let current_block_type_1 = select_block_type_1(ctx);
    	let if_block3 = current_block_type_1(ctx);

    	const block = {
    		c: function create() {
    			div8 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div7 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Votre inscription";
    			t2 = space();
    			hr = element("hr");
    			t3 = space();
    			div1 = element("div");
    			div1.textContent = "Merci de renseigner votre adresse mail et de cliquer sur vérifier.";
    			t5 = space();
    			div6 = element("div");
    			div5 = element("div");
    			div3 = element("div");
    			div2 = element("div");
    			div2.textContent = "email";
    			t7 = space();
    			input0 = element("input");
    			t8 = space();
    			div4 = element("div");
    			if (if_block0) if_block0.c();
    			t9 = space();
    			if (if_block1) if_block1.c();
    			t10 = space();
    			if (if_block2) if_block2.c();
    			t11 = space();
    			label = element("label");
    			input1 = element("input");
    			t12 = text("\n                Enregistrer mon adresse email pour la prochaine fois (ces informations sont stockées sur votre machine)");
    			t13 = space();
    			if_block3.c();
    			attr_dev(div0, "class", "absolute w-full h-full  bg-black opacity-75 top-0 left-0 cursor-pointer");
    			add_location(div0, file$1, 293, 1, 10946);
    			attr_dev(h2, "class", "text-xl w-full pb-1 mb-1 border-b-2 border-vertLBF font-bold");
    			add_location(h2, file$1, 296, 2, 11208);
    			attr_dev(hr, "class", "mb-1");
    			add_location(hr, file$1, 299, 2, 11313);
    			attr_dev(div1, "class", "mb-1 text-base font-medium text-justify");
    			add_location(div1, file$1, 300, 2, 11335);
    			attr_dev(div2, "class", "ml-1 text-xs m-0 p-0 font-medium text-vertLBF");
    			add_location(div2, file$1, 306, 20, 11665);
    			attr_dev(input0, "class", "h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfvert-600 border-2 border-lbfvert-400 rounded-lg px-4 block appearance-none leading-normal");
    			attr_dev(input0, "type", "email");
    			attr_dev(input0, "placeholder", "adresse email");
    			add_location(input0, file$1, 309, 20, 11802);
    			attr_dev(div3, "class", "flex flex-col mt-1");
    			add_location(div3, file$1, 305, 16, 11612);
    			attr_dev(div4, "class", "m-0 p-0 mt-1 self-end");
    			add_location(div4, file$1, 312, 16, 12203);
    			attr_dev(div5, "class", "flex flex-row flex-wrap md:flex-no-wrap justify-start content-end");
    			add_location(div5, file$1, 304, 12, 11516);
    			attr_dev(input1, "type", "checkbox");
    			attr_dev(input1, "class", "form-checkbox text-lbfvert-600");
    			add_location(input1, file$1, 344, 16, 14474);
    			attr_dev(label, "class", "mx-8 pr-8 my-1 text-sm");
    			add_location(label, file$1, 343, 12, 14419);
    			attr_dev(div6, "class", "flex flex-col");
    			add_location(div6, file$1, 303, 8, 11476);
    			attr_dev(div7, "class", "relative overflow-auto max-h-5/6 w-5/6 sm:max-w-620px bg-white flex flex-col p-4 items-start rounded");
    			attr_dev(div7, "role", "dialog");
    			attr_dev(div7, "aria-modal", "true");
    			add_location(div7, file$1, 295, 1, 11058);
    			attr_dev(div8, "class", "z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center");
    			add_location(div8, file$1, 292, 0, 10859);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div8, anchor);
    			append_dev(div8, div0);
    			append_dev(div8, t0);
    			append_dev(div8, div7);
    			append_dev(div7, h2);
    			append_dev(div7, t2);
    			append_dev(div7, hr);
    			append_dev(div7, t3);
    			append_dev(div7, div1);
    			append_dev(div7, t5);
    			append_dev(div7, div6);
    			append_dev(div6, div5);
    			append_dev(div5, div3);
    			append_dev(div3, div2);
    			append_dev(div3, t7);
    			append_dev(div3, input0);
    			set_input_value(input0, /*emailInscription*/ ctx[20]);
    			append_dev(div5, t8);
    			append_dev(div5, div4);
    			if (if_block0) if_block0.m(div4, null);
    			append_dev(div5, t9);
    			if (if_block1) if_block1.m(div5, null);
    			append_dev(div5, t10);
    			if (if_block2) if_block2.m(div5, null);
    			append_dev(div6, t11);
    			append_dev(div6, label);
    			append_dev(label, input1);
    			input1.checked = /*saveInfo*/ ctx[18];
    			append_dev(label, t12);
    			append_dev(div7, t13);
    			if_block3.m(div7, null);

    			if (!mounted) {
    				dispose = [
    					listen_dev(div0, "click", /*close*/ ctx[30], false, false, false),
    					listen_dev(input0, "input", /*input_handler*/ ctx[36], false, false, false),
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[37]),
    					listen_dev(input1, "change", /*input1_change_handler*/ ctx[38])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*emailInscription*/ 1048576 && input0.value !== /*emailInscription*/ ctx[20]) {
    				set_input_value(input0, /*emailInscription*/ ctx[20]);
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if (if_block0) if_block0.d(1);
    				if_block0 = current_block_type && current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div4, null);
    				}
    			}

    			if (/*flagEmailVide*/ ctx[11]) {
    				if (if_block1) ; else {
    					if_block1 = create_if_block_15(ctx);
    					if_block1.c();
    					if_block1.m(div5, t10);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*flagEmailInvalide*/ ctx[12]) {
    				if (if_block2) ; else {
    					if_block2 = create_if_block_14(ctx);
    					if_block2.c();
    					if_block2.m(div5, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (dirty[0] & /*saveInfo*/ 262144) {
    				input1.checked = /*saveInfo*/ ctx[18];
    			}

    			if (current_block_type_1 === (current_block_type_1 = select_block_type_1(ctx)) && if_block3) {
    				if_block3.p(ctx, dirty);
    			} else {
    				if_block3.d(1);
    				if_block3 = current_block_type_1(ctx);

    				if (if_block3) {
    					if_block3.c();
    					if_block3.m(div7, null);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div8);

    			if (if_block0) {
    				if_block0.d();
    			}

    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if_block3.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(292:0) {#if showModalInscription}",
    		ctx
    	});

    	return block;
    }

    // (327:48) 
    function create_if_block_17(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Vérifier";
    			attr_dev(button, "class", "w-full sm:w-20 mx-1 px-2 h-10 border-2 border-vertLBF rounded text-vertLBF font-semibold");
    			attr_dev(button, "type", "button");
    			add_location(button, file$1, 327, 24, 13656);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*verifInscrits*/ ctx[21], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_17.name,
    		type: "if",
    		source: "(327:48) ",
    		ctx
    	});

    	return block;
    }

    // (314:20) {#if actionEncours}
    function create_if_block_16(ctx) {
    	let svg;
    	let g;
    	let circle0;
    	let animate0;
    	let animate1;
    	let circle1;
    	let animate2;
    	let animate3;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			g = svg_element("g");
    			circle0 = svg_element("circle");
    			animate0 = svg_element("animate");
    			animate1 = svg_element("animate");
    			circle1 = svg_element("circle");
    			animate2 = svg_element("animate");
    			animate3 = svg_element("animate");
    			attr_dev(animate0, "attributeName", "r");
    			attr_dev(animate0, "begin", "0s");
    			attr_dev(animate0, "dur", "1.8s");
    			attr_dev(animate0, "values", "1; 20");
    			attr_dev(animate0, "calcMode", "spline");
    			attr_dev(animate0, "keyTimes", "0; 1");
    			attr_dev(animate0, "keySplines", "0.165, 0.84, 0.44, 1");
    			attr_dev(animate0, "repeatCount", "indefinite");
    			add_location(animate0, file$1, 317, 36, 12600);
    			attr_dev(animate1, "attributeName", "stroke-opacity");
    			attr_dev(animate1, "begin", "0s");
    			attr_dev(animate1, "dur", "1.8s");
    			attr_dev(animate1, "values", "1; 0");
    			attr_dev(animate1, "calcMode", "spline");
    			attr_dev(animate1, "keyTimes", "0; 1");
    			attr_dev(animate1, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate1, "repeatCount", "indefinite");
    			add_location(animate1, file$1, 318, 36, 12795);
    			attr_dev(circle0, "cx", "22");
    			attr_dev(circle0, "cy", "22");
    			attr_dev(circle0, "r", "1");
    			add_location(circle0, file$1, 316, 32, 12533);
    			attr_dev(animate2, "attributeName", "r");
    			attr_dev(animate2, "begin", "-0.9s");
    			attr_dev(animate2, "dur", "1.8s");
    			attr_dev(animate2, "values", "1; 20");
    			attr_dev(animate2, "calcMode", "spline");
    			attr_dev(animate2, "keyTimes", "0; 1");
    			attr_dev(animate2, "keySplines", "0.165, 0.84, 0.44, 1");
    			attr_dev(animate2, "repeatCount", "indefinite");
    			add_location(animate2, file$1, 321, 36, 13106);
    			attr_dev(animate3, "attributeName", "stroke-opacity");
    			attr_dev(animate3, "begin", "-0.9s");
    			attr_dev(animate3, "dur", "1.8s");
    			attr_dev(animate3, "values", "1; 0");
    			attr_dev(animate3, "calcMode", "spline");
    			attr_dev(animate3, "keyTimes", "0; 1");
    			attr_dev(animate3, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate3, "repeatCount", "indefinite");
    			add_location(animate3, file$1, 322, 36, 13304);
    			attr_dev(circle1, "cx", "22");
    			attr_dev(circle1, "cy", "22");
    			attr_dev(circle1, "r", "1");
    			add_location(circle1, file$1, 320, 32, 13039);
    			attr_dev(g, "fill", "none");
    			attr_dev(g, "fill-rule", "evenodd");
    			attr_dev(g, "stroke-width", "2");
    			add_location(g, file$1, 315, 28, 12448);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "class", "stroke-current text-lbfvert-500 h-10 w-18 ml-4 ");
    			attr_dev(svg, "viewBox", "0 0 50 50");
    			add_location(svg, file$1, 314, 24, 12303);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, g);
    			append_dev(g, circle0);
    			append_dev(circle0, animate0);
    			append_dev(circle0, animate1);
    			append_dev(g, circle1);
    			append_dev(circle1, animate2);
    			append_dev(circle1, animate3);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_16.name,
    		type: "if",
    		source: "(314:20) {#if actionEncours}",
    		ctx
    	});

    	return block;
    }

    // (333:16) {#if flagEmailVide}
    function create_if_block_15(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Veuillez entrer une adresse email pour démarrer l'inscription.";
    			attr_dev(div, "class", "m-0 p-0 mt-1 self-end text-rougeLBF");
    			add_location(div, file$1, 333, 20, 13977);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_15.name,
    		type: "if",
    		source: "(333:16) {#if flagEmailVide}",
    		ctx
    	});

    	return block;
    }

    // (338:16) {#if flagEmailInvalide}
    function create_if_block_14(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Veuillez entrer une adresse email valide.";
    			attr_dev(div, "class", "m-0 p-0 mt-1 self-end text-rougeLBF");
    			add_location(div, file$1, 338, 20, 14223);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_14.name,
    		type: "if",
    		source: "(338:16) {#if flagEmailInvalide}",
    		ctx
    	});

    	return block;
    }

    // (361:8) {:else}
    function create_else_block$1(ctx) {
    	let div0;
    	let t1;
    	let t2;
    	let div1;
    	let each_blocks = [];
    	let each1_lookup = new Map();
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let div2;
    	let t7;
    	let t8;
    	let each_value_1 = /*listeInscrits*/ ctx[2];
    	validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*nouveauxInscrits*/ ctx[4];
    	validate_each_argument(each_value);
    	const get_key = ctx => "nI" + /*index*/ ctx[53];
    	validate_each_keys(ctx, each_value, get_each_context, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	let if_block0 = /*nbPlaces*/ ctx[3] - /*nouveauxInscrits*/ ctx[4].length === 0 && create_if_block_11(ctx);
    	let if_block1 = /*nbPlaces*/ ctx[3] - /*nouveauxInscrits*/ ctx[4].length > 0 && create_if_block_10(ctx);
    	let if_block2 = /*listeInscrits*/ ctx[2].length > 0 && create_if_block_9(ctx);
    	let if_block3 = /*flagSaveValide*/ ctx[10] && create_if_block_8(ctx);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			div0.textContent = "Liste des inscriptions";
    			t1 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t2 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t3 = space();
    			t4 = text(/*nbPlaces*/ ctx[3]);
    			t5 = space();
    			if (if_block0) if_block0.c();
    			t6 = space();
    			div2 = element("div");
    			if (if_block1) if_block1.c();
    			t7 = space();
    			if (if_block2) if_block2.c();
    			t8 = space();
    			if (if_block3) if_block3.c();
    			attr_dev(div0, "class", "text-lg font-bold mt-2 text-bleuLBF");
    			add_location(div0, file$1, 361, 6, 15553);
    			add_location(div1, file$1, 385, 12, 17526);
    			add_location(div2, file$1, 420, 12, 20375);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			insert_dev(target, t1, anchor);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(target, anchor);
    			}

    			insert_dev(target, t2, anchor);
    			insert_dev(target, div1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			/*div1_binding*/ ctx[41](div1);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, t5, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, div2, anchor);
    			if (if_block1) if_block1.m(div2, null);
    			append_dev(div2, t7);
    			if (if_block2) if_block2.m(div2, null);
    			append_dev(div2, t8);
    			if (if_block3) if_block3.m(div2, null);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*confirmerEffaceInscrit, listeInscrits, validationSave*/ 301989892) {
    				each_value_1 = /*listeInscrits*/ ctx[2];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(t2.parentNode, t2);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty[0] & /*nouveauxInscrits, soustraitInscrit, validationSave*/ 402653200) {
    				const each_value = /*nouveauxInscrits*/ ctx[4];
    				validate_each_argument(each_value);
    				validate_each_keys(ctx, each_value, get_each_context, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each1_lookup, div1, destroy_block, create_each_block, null, get_each_context);
    			}

    			if (dirty[0] & /*nbPlaces*/ 8) set_data_dev(t4, /*nbPlaces*/ ctx[3]);

    			if (/*nbPlaces*/ ctx[3] - /*nouveauxInscrits*/ ctx[4].length === 0) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_11(ctx);
    					if_block0.c();
    					if_block0.m(t6.parentNode, t6);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*nbPlaces*/ ctx[3] - /*nouveauxInscrits*/ ctx[4].length > 0) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_10(ctx);
    					if_block1.c();
    					if_block1.m(div2, t7);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*listeInscrits*/ ctx[2].length > 0) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_9(ctx);
    					if_block2.c();
    					if_block2.m(div2, t8);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (/*flagSaveValide*/ ctx[10]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block_8(ctx);
    					if_block3.c();
    					if_block3.m(div2, null);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t1);
    			destroy_each(each_blocks_1, detaching);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			/*div1_binding*/ ctx[41](null);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(t5);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(div2);
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(361:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (357:57) 
    function create_if_block_7(ctx) {
    	let h2;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "Cet atelier est complet. Nos ateliers sont régulièrement proposés, surveillez cet espace pour le prochain.";
    			attr_dev(h2, "class", "text-base text-bleuLBF w-full mt-2 mx-2 pb-1 mb-1 font-bold");
    			add_location(h2, file$1, 357, 12, 15317);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_7.name,
    		type: "if",
    		source: "(357:57) ",
    		ctx
    	});

    	return block;
    }

    // (349:8) {#if !flagEmailVerifie}
    function create_if_block_6(ctx) {
    	let div;
    	let t0;
    	let ul;
    	let li0;
    	let t2;
    	let li1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t0 = text("Une fois votre mail validé, vous pourrez :\n                ");
    			ul = element("ul");
    			li0 = element("li");
    			li0.textContent = "Si l'atelier n'est pas complet, entrer les nom et prénom (seul le prénom est requis) de la ou des personnes participant à l'atelier";
    			t2 = space();
    			li1 = element("li");
    			li1.textContent = "Si vous avez déjà effectué une inscription à cet atelier, vous pourrez modifier celle-ci ou vous désinscrire.";
    			add_location(li0, file$1, 352, 20, 14924);
    			add_location(li1, file$1, 353, 20, 15086);
    			attr_dev(ul, "class", "list-disc ml-6");
    			add_location(ul, file$1, 351, 16, 14876);
    			attr_dev(div, "class", "text-base text-justify");
    			add_location(div, file$1, 349, 12, 14763);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t0);
    			append_dev(div, ul);
    			append_dev(ul, li0);
    			append_dev(ul, t2);
    			append_dev(ul, li1);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6.name,
    		type: "if",
    		source: "(349:8) {#if !flagEmailVerifie}",
    		ctx
    	});

    	return block;
    }

    // (377:16) {#if listeInscrits.length > 1}
    function create_if_block_13(ctx) {
    	let div;
    	let svg;
    	let path;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M268 416h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12zM432 80h-82.41l-34-56.7A48 48 0 00274.41 0H173.59a48 48 0 00-41.16 23.3L98.41 80H16A16 16 0 000 96v16a16 16 0 0016 16h16v336a48 48 0 0048 48h288a48 48 0 0048-48V128h16a16 16 0 0016-16V96a16 16 0 00-16-16zM171.84 50.91A6 6 0 01177 48h94a6 6 0 015.15 2.91L293.61 80H154.39zM368 464H80V128h288zm-212-48h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12z");
    			add_location(path, file$1, 379, 6, 16944);
    			attr_dev(svg, "class", "mx-auto cursor-pointer mt-3 h-12 w-12 sm:h-8 sm:w-8 stroke-current text-lbfbleu-600");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "data-prefix", "far");
    			attr_dev(svg, "data-icon", "trash-alt");
    			attr_dev(svg, "viewBox", "0 0 448 512");
    			add_location(svg, file$1, 378, 5, 16669);
    			attr_dev(div, "class", "my-auto sm:w-12 w-20");
    			add_location(div, file$1, 377, 4, 16629);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, path);

    			if (!mounted) {
    				dispose = listen_dev(
    					svg,
    					"click",
    					function () {
    						if (is_function(/*confirmerEffaceInscrit*/ ctx[25](/*inscrit*/ ctx[54].id, /*inscrit*/ ctx[54]))) /*confirmerEffaceInscrit*/ ctx[25](/*inscrit*/ ctx[54].id, /*inscrit*/ ctx[54]).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_13.name,
    		type: "if",
    		source: "(377:16) {#if listeInscrits.length > 1}",
    		ctx
    	});

    	return block;
    }

    // (363:3) {#each listeInscrits as inscrit}
    function create_each_block_1(ctx) {
    	let div3;
    	let div2;
    	let div1;
    	let div0;
    	let t1;
    	let input;
    	let t2;
    	let mounted;
    	let dispose;

    	function input_input_handler() {
    		/*input_input_handler*/ ctx[39].call(input, /*each_value_1*/ ctx[55], /*inscrit_index*/ ctx[56]);
    	}

    	let if_block = /*listeInscrits*/ ctx[2].length > 1 && create_if_block_13(ctx);

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = "Prénom";
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			if (if_block) if_block.c();
    			attr_dev(div0, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div0, file$1, 366, 6, 15826);
    			attr_dev(input, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "placeholder", "prenom");
    			add_location(input, file$1, 367, 6, 15904);
    			attr_dev(div1, "class", "flex flex-col sm:mr-2");
    			add_location(div1, file$1, 365, 5, 15784);
    			attr_dev(div2, "class", "flex flex-col sm:flex-row flex-wrap ");
    			add_location(div2, file$1, 364, 4, 15728);
    			attr_dev(div3, "class", "w-full flex flex-row justify-start mb-4");
    			add_location(div3, file$1, 363, 3, 15670);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div1, t1);
    			append_dev(div1, input);
    			set_input_value(input, /*inscrit*/ ctx[54].prenom);
    			append_dev(div3, t2);
    			if (if_block) if_block.m(div3, null);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "input", /*validationSave*/ ctx[28], false, false, false),
    					listen_dev(input, "input", input_input_handler)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*listeInscrits*/ 4 && input.value !== /*inscrit*/ ctx[54].prenom) {
    				set_input_value(input, /*inscrit*/ ctx[54].prenom);
    			}

    			if (/*listeInscrits*/ ctx[2].length > 1) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_13(ctx);
    					if_block.c();
    					if_block.m(div3, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(363:3) {#each listeInscrits as inscrit}",
    		ctx
    	});

    	return block;
    }

    // (411:20) {:else}
    function create_else_block_1(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = " ";
    			attr_dev(div, "class", "text-sm font-medium text-rougeLBF ");
    			add_location(div, file$1, 411, 24, 19992);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(411:20) {:else}",
    		ctx
    	});

    	return block;
    }

    // (409:20) {#if nouvelInscrit.prenom===""}
    function create_if_block_12(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Le prénom est requis.";
    			attr_dev(div, "class", "text-sm font-medium text-rougeLBF ");
    			add_location(div, file$1, 409, 24, 19864);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_12.name,
    		type: "if",
    		source: "(409:20) {#if nouvelInscrit.prenom===\\\"\\\"}",
    		ctx
    	});

    	return block;
    }

    // (387:3) {#each nouveauxInscrits as nouvelInscrit, index ('nI' + index)}
    function create_each_block(key_1, ctx) {
    	let div5;
    	let div4;
    	let div2;
    	let div1;
    	let div0;
    	let t1;
    	let input;
    	let t2;
    	let div3;
    	let svg;
    	let path;
    	let t3;
    	let t4;
    	let mounted;
    	let dispose;

    	function input_input_handler_1() {
    		/*input_input_handler_1*/ ctx[40].call(input, /*each_value*/ ctx[52], /*index*/ ctx[53]);
    	}

    	function select_block_type_2(ctx, dirty) {
    		if (/*nouvelInscrit*/ ctx[51].prenom === "") return create_if_block_12;
    		return create_else_block_1;
    	}

    	let current_block_type = select_block_type_2(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = "Prénom";
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			div3 = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t3 = space();
    			if_block.c();
    			t4 = space();
    			attr_dev(div0, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div0, file$1, 391, 32, 17882);
    			attr_dev(input, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "placeholder", "prenom");
    			add_location(input, file$1, 392, 32, 17986);
    			attr_dev(div1, "class", "flex flex-col");
    			add_location(div1, file$1, 390, 28, 17822);
    			attr_dev(div2, "class", "flex flex-col sm:flex-row");
    			add_location(div2, file$1, 389, 24, 17754);
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z");
    			add_location(path, file$1, 404, 32, 19247);
    			attr_dev(svg, "class", "mx-auto cursor-pointer mt-3 h-12 w-12 md:h-8 md:w-8 stroke-current text-rougeLBF");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "data-prefix", "far");
    			attr_dev(svg, "data-icon", "trash-alt");
    			attr_dev(svg, "viewBox", "0 0 448 512");
    			add_location(svg, file$1, 403, 28, 18969);
    			attr_dev(div3, "class", "my-auto");
    			add_location(div3, file$1, 402, 24, 18919);
    			attr_dev(div4, "class", "flex flex-row justify-end");
    			add_location(div4, file$1, 388, 20, 17690);
    			attr_dev(div5, "class", "w-full flex flex-col justify-start");
    			add_location(div5, file$1, 387, 4, 17621);
    			this.first = div5;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div1, t1);
    			append_dev(div1, input);
    			set_input_value(input, /*nouvelInscrit*/ ctx[51].prenom);
    			append_dev(div4, t2);
    			append_dev(div4, div3);
    			append_dev(div3, svg);
    			append_dev(svg, path);
    			append_dev(div5, t3);
    			if_block.m(div5, null);
    			append_dev(div5, t4);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "input", /*validationSave*/ ctx[28], false, false, false),
    					listen_dev(input, "input", input_input_handler_1),
    					listen_dev(
    						svg,
    						"click",
    						function () {
    							if (is_function(/*soustraitInscrit*/ ctx[27](/*index*/ ctx[53]))) /*soustraitInscrit*/ ctx[27](/*index*/ ctx[53]).apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*nouveauxInscrits*/ 16 && input.value !== /*nouvelInscrit*/ ctx[51].prenom) {
    				set_input_value(input, /*nouvelInscrit*/ ctx[51].prenom);
    			}

    			if (current_block_type !== (current_block_type = select_block_type_2(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div5, t4);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(387:3) {#each nouveauxInscrits as nouvelInscrit, index ('nI' + index)}",
    		ctx
    	});

    	return block;
    }

    // (418:12) {#if (nbPlaces-nouveauxInscrits.length) === 0}
    function create_if_block_11(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Cet atelier ne peut accepter plus de participants.";
    			attr_dev(div, "class", "text-sm sm:text-xs md:text-sm font-medium text-rougeLBF ");
    			add_location(div, file$1, 418, 16, 20218);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_11.name,
    		type: "if",
    		source: "(418:12) {#if (nbPlaces-nouveauxInscrits.length) === 0}",
    		ctx
    	});

    	return block;
    }

    // (422:16) {#if (nbPlaces-nouveauxInscrits.length) > 0}
    function create_if_block_10(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Ajouter un participant";
    			attr_dev(button, "class", "mt-1 mx-1 px-1 border-2 border-vertLBF rounded text-base font-medium text-vertLBF");
    			add_location(button, file$1, 422, 20, 20462);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*ajoutInscrit*/ ctx[26], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_10.name,
    		type: "if",
    		source: "(422:16) {#if (nbPlaces-nouveauxInscrits.length) > 0}",
    		ctx
    	});

    	return block;
    }

    // (427:16) {#if listeInscrits.length > 0}
    function create_if_block_9(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Se désinscrire";
    			attr_dev(button, "class", "mt-1 mx-1 px-1 border-2 border-orangeLBF rounded text-base font-medium text-orangeLBF");
    			add_location(button, file$1, 427, 20, 20751);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[42], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_9.name,
    		type: "if",
    		source: "(427:16) {#if listeInscrits.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (432:16) {#if flagSaveValide}
    function create_if_block_8(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Enregistrer";
    			attr_dev(button, "class", "mt-1 mx-1 px-1 border-2 border-bleuLBF rounded text-base font-medium text-bleuLBF");
    			add_location(button, file$1, 432, 16, 21046);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*insertInscrits*/ ctx[22], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_8.name,
    		type: "if",
    		source: "(432:16) {#if flagSaveValide}",
    		ctx
    	});

    	return block;
    }

    // (442:0) {#if flagVerifDesinscription}
    function create_if_block_4(ctx) {
    	let mon_modal;
    	let span0;
    	let t1;
    	let span1;
    	let t3;
    	let span2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			mon_modal = element("mon-modal");
    			span0 = element("span");
    			span0.textContent = "Confirmation";
    			t1 = text("\n            Merci de confirmer votre désinscription.\n        ");
    			span1 = element("span");
    			span1.textContent = "Confirmer";
    			t3 = space();
    			span2 = element("span");
    			span2.textContent = "Annuler";
    			attr_dev(span0, "slot", "titre");
    			add_location(span0, file$1, 443, 8, 21471);
    			attr_dev(span1, "slot", "boutonBleu");
    			add_location(span1, file$1, 445, 8, 21571);
    			attr_dev(span2, "slot", "boutonDefaut");
    			add_location(span2, file$1, 446, 8, 21620);
    			set_custom_element_data(mon_modal, "has_bouton_bleu", "true");
    			set_custom_element_data(mon_modal, "bouton_bleu_busy", /*busyEffacerInscription*/ ctx[13]);
    			add_location(mon_modal, file$1, 442, 4, 21334);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, span1);
    			append_dev(mon_modal, t3);
    			append_dev(mon_modal, span2);

    			if (!mounted) {
    				dispose = [
    					listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    					listen_dev(mon_modal, "boutonBleu", /*effacerInscription*/ ctx[23], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*busyEffacerInscription*/ 8192) {
    				set_custom_element_data(mon_modal, "bouton_bleu_busy", /*busyEffacerInscription*/ ctx[13]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(442:0) {#if flagVerifDesinscription}",
    		ctx
    	});

    	return block;
    }

    // (450:0) {#if flagVerifEffacer}
    function create_if_block_3(ctx) {
    	let mon_modal;
    	let span0;
    	let t1;
    	let t2_value = /*desinscrit*/ ctx[5].prenom + "";
    	let t2;
    	let t3;
    	let span1;
    	let t5;
    	let span2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			mon_modal = element("mon-modal");
    			span0 = element("span");
    			span0.textContent = "Confirmation";
    			t1 = text("\n            Merci de confirmer la désinscription de ");
    			t2 = text(t2_value);
    			t3 = space();
    			span1 = element("span");
    			span1.textContent = "Confirmer";
    			t5 = space();
    			span2 = element("span");
    			span2.textContent = "Annuler";
    			attr_dev(span0, "slot", "titre");
    			add_location(span0, file$1, 451, 8, 21840);
    			attr_dev(span1, "slot", "boutonBleu");
    			add_location(span1, file$1, 453, 8, 21959);
    			attr_dev(span2, "slot", "boutonDefaut");
    			add_location(span2, file$1, 454, 8, 22008);
    			set_custom_element_data(mon_modal, "has_bouton_bleu", "true");
    			set_custom_element_data(mon_modal, "bouton_bleu_busy", /*busyEffacerInscrit*/ ctx[15]);
    			add_location(mon_modal, file$1, 450, 4, 21711);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, t2);
    			append_dev(mon_modal, t3);
    			append_dev(mon_modal, span1);
    			append_dev(mon_modal, t5);
    			append_dev(mon_modal, span2);

    			if (!mounted) {
    				dispose = [
    					listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    					listen_dev(mon_modal, "boutonBleu", /*effacerInscrit*/ ctx[24], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*desinscrit*/ 32 && t2_value !== (t2_value = /*desinscrit*/ ctx[5].prenom + "")) set_data_dev(t2, t2_value);

    			if (dirty[0] & /*busyEffacerInscrit*/ 32768) {
    				set_custom_element_data(mon_modal, "bouton_bleu_busy", /*busyEffacerInscrit*/ ctx[15]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(450:0) {#if flagVerifEffacer}",
    		ctx
    	});

    	return block;
    }

    // (458:0) {#if confirmeDesinscription}
    function create_if_block_2(ctx) {
    	let mon_modal;
    	let span0;
    	let t1;
    	let span1;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			mon_modal = element("mon-modal");
    			span0 = element("span");
    			span0.textContent = "Votre desinscription";
    			t1 = text("\n            Votre désinscription a bien été enregistrée. \n        ");
    			span1 = element("span");
    			span1.textContent = "Confirmer";
    			attr_dev(span0, "slot", "titre");
    			add_location(span0, file$1, 459, 8, 22173);
    			attr_dev(span1, "slot", "boutonBleu");
    			add_location(span1, file$1, 461, 8, 22286);
    			add_location(mon_modal, file$1, 458, 4, 22105);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, span1);

    			if (!mounted) {
    				dispose = [
    					listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    					listen_dev(mon_modal, "boutonBleu", /*effacerInscrit*/ ctx[24], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(458:0) {#if confirmeDesinscription}",
    		ctx
    	});

    	return block;
    }

    // (465:0) {#if confirmeDesinscrit}
    function create_if_block_1$1(ctx) {
    	let mon_modal;
    	let span0;
    	let t1;
    	let t2_value = /*desinscrit*/ ctx[5].prenom + "";
    	let t2;
    	let t3;
    	let span1;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			mon_modal = element("mon-modal");
    			span0 = element("span");
    			span0.textContent = "Desinscription";
    			t1 = space();
    			t2 = text(t2_value);
    			t3 = text(" est bien désinscrit.\n        ");
    			span1 = element("span");
    			span1.textContent = "Confirmer";
    			attr_dev(span0, "slot", "titre");
    			add_location(span0, file$1, 466, 8, 22447);
    			attr_dev(span1, "slot", "boutonBleu");
    			add_location(span1, file$1, 468, 8, 22548);
    			add_location(mon_modal, file$1, 465, 4, 22379);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, t2);
    			append_dev(mon_modal, t3);
    			append_dev(mon_modal, span1);

    			if (!mounted) {
    				dispose = [
    					listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    					listen_dev(mon_modal, "boutonBleu", /*effacerInscrit*/ ctx[24], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*desinscrit*/ 32 && t2_value !== (t2_value = /*desinscrit*/ ctx[5].prenom + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(465:0) {#if confirmeDesinscrit}",
    		ctx
    	});

    	return block;
    }

    // (472:0) {#if confirmeInscription}
    function create_if_block$1(ctx) {
    	let mon_modal;
    	let span0;
    	let t1;
    	let span1;
    	let t2;
    	let br;
    	let t3;
    	let t4;
    	let span2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			mon_modal = element("mon-modal");
    			span0 = element("span");
    			span0.textContent = "Votre inscription";
    			t1 = space();
    			span1 = element("span");
    			t2 = text("Votre inscription a bien été enregistrée. Vous allez recevoir un mail de confirmation qui contient un lien vous permettant éventuellement de vous désinscrire.");
    			br = element("br");
    			t3 = text("\n            Si vous ne l'avez pas reçu dans les prochaines minutes, il y a pu avoir un problème de notre serveur ou une erreur dans l'adresse enregistrée. Cela ne compromet pas votre inscription, mais nous serons dans l'impossibilité de vous contacter si besoin.");
    			t4 = space();
    			span2 = element("span");
    			span2.textContent = "Confirmer";
    			attr_dev(span0, "slot", "titre");
    			add_location(span0, file$1, 473, 8, 22710);
    			add_location(br, file$1, 475, 170, 22960);
    			attr_dev(span1, "class", "text-justify");
    			add_location(span1, file$1, 474, 8, 22762);
    			attr_dev(span2, "slot", "boutonBleu");
    			add_location(span2, file$1, 478, 8, 23254);
    			add_location(mon_modal, file$1, 472, 4, 22642);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, span1);
    			append_dev(span1, t2);
    			append_dev(span1, br);
    			append_dev(span1, t3);
    			append_dev(mon_modal, t4);
    			append_dev(mon_modal, span2);

    			if (!mounted) {
    				dispose = [
    					listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    					listen_dev(mon_modal, "boutonBleu", /*effacerInscrit*/ ctx[24], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(472:0) {#if confirmeInscription}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div4;
    	let div1;
    	let div0;
    	let t0;
    	let t1;
    	let div3;
    	let svg;
    	let path;
    	let t2;
    	let div2;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let t9;
    	let t10;
    	let slot;
    	let mounted;
    	let dispose;
    	let if_block0 = /*showModalInscription*/ ctx[1] && create_if_block_5(ctx);
    	let if_block1 = /*flagVerifDesinscription*/ ctx[9] && create_if_block_4(ctx);
    	let if_block2 = /*flagVerifEffacer*/ ctx[8] && create_if_block_3(ctx);
    	let if_block3 = /*confirmeDesinscription*/ ctx[14] && create_if_block_2(ctx);
    	let if_block4 = /*confirmeDesinscrit*/ ctx[16] && create_if_block_1$1(ctx);
    	let if_block5 = /*confirmeInscription*/ ctx[17] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			t0 = text(/*placesRestantes*/ ctx[0]);
    			t1 = space();
    			div3 = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t2 = space();
    			div2 = element("div");
    			div2.textContent = "inscriptions";
    			t4 = space();
    			if (if_block0) if_block0.c();
    			t5 = space();
    			if (if_block1) if_block1.c();
    			t6 = space();
    			if (if_block2) if_block2.c();
    			t7 = space();
    			if (if_block3) if_block3.c();
    			t8 = space();
    			if (if_block4) if_block4.c();
    			t9 = space();
    			if (if_block5) if_block5.c();
    			t10 = space();
    			slot = element("slot");
    			this.c = noop;
    			attr_dev(div0, "class", "my-auto");
    			add_location(div0, file$1, 281, 2, 9866);
    			attr_dev(div1, "class", "bg-orangeLBF flex flex-row mr-1 text-black text-sm px-1");
    			add_location(div1, file$1, 280, 1, 9794);
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z");
    			add_location(path, file$1, 285, 3, 10180);
    			attr_dev(svg, "class", "fill-current text-black my-auto");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "viewBox", "0 0 640 512");
    			add_location(svg, file$1, 284, 2, 10032);
    			attr_dev(div2, "class", "text-black text-sm my-auto");
    			add_location(div2, file$1, 287, 2, 10731);
    			attr_dev(div3, "class", "bg-orangeLBF flex flex-row content-center rounded-r px-1 cursor-pointer");
    			add_location(div3, file$1, 283, 1, 9920);
    			attr_dev(div4, "class", "flex flex-row content-center");
    			add_location(div4, file$1, 279, 0, 9750);
    			add_location(slot, file$1, 481, 0, 23318);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div1);
    			append_dev(div1, div0);
    			append_dev(div0, t0);
    			append_dev(div4, t1);
    			append_dev(div4, div3);
    			append_dev(div3, svg);
    			append_dev(svg, path);
    			append_dev(div3, t2);
    			append_dev(div3, div2);
    			insert_dev(target, t4, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t5, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, t6, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert_dev(target, t7, anchor);
    			if (if_block3) if_block3.m(target, anchor);
    			insert_dev(target, t8, anchor);
    			if (if_block4) if_block4.m(target, anchor);
    			insert_dev(target, t9, anchor);
    			if (if_block5) if_block5.m(target, anchor);
    			insert_dev(target, t10, anchor);
    			insert_dev(target, slot, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(window_1, "keydown", /*handle_keydown*/ ctx[31], false, false, false),
    					listen_dev(div3, "click", /*afficheModal*/ ctx[29], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*placesRestantes*/ 1) set_data_dev(t0, /*placesRestantes*/ ctx[0]);

    			if (/*showModalInscription*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					if_block0.m(t5.parentNode, t5);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*flagVerifDesinscription*/ ctx[9]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_4(ctx);
    					if_block1.c();
    					if_block1.m(t6.parentNode, t6);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*flagVerifEffacer*/ ctx[8]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_3(ctx);
    					if_block2.c();
    					if_block2.m(t7.parentNode, t7);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (/*confirmeDesinscription*/ ctx[14]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block_2(ctx);
    					if_block3.c();
    					if_block3.m(t8.parentNode, t8);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (/*confirmeDesinscrit*/ ctx[16]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);
    				} else {
    					if_block4 = create_if_block_1$1(ctx);
    					if_block4.c();
    					if_block4.m(t9.parentNode, t9);
    				}
    			} else if (if_block4) {
    				if_block4.d(1);
    				if_block4 = null;
    			}

    			if (/*confirmeInscription*/ ctx[17]) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);
    				} else {
    					if_block5 = create_if_block$1(ctx);
    					if_block5.c();
    					if_block5.m(t10.parentNode, t10);
    				}
    			} else if (if_block5) {
    				if_block5.d(1);
    				if_block5 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			if (detaching) detach_dev(t4);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t5);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(t6);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach_dev(t7);
    			if (if_block3) if_block3.d(detaching);
    			if (detaching) detach_dev(t8);
    			if (if_block4) if_block4.d(detaching);
    			if (detaching) detach_dev(t9);
    			if (if_block5) if_block5.d(detaching);
    			if (detaching) detach_dev(t10);
    			if (detaching) detach_dev(slot);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { id_atelier = "nope" } = $$props;
    	let { url_illustration = "logoLBFSeul_a1t4af.png" } = $$props;
    	let { date_atelier = "" } = $$props;
    	let { titre_atelier = "Un titre Atelier" } = $$props;

    	// récupération adresse pour vérifier si arrivée d'un lien de désinscription
    	var urlModifInscription = window.location.search;

    	var urlMail = window.location.origin + window.location.pathname;

    	/* variables */
    	var testModal = false;

    	var placesRestantes = "Calculs en cours...";
    	let showModalInscription = false;
    	var listeInscrits = [];
    	var nbPlaces = -1;
    	var nouveauxInscrits = [{ nom: "", prenom: "" }];
    	var desinscrit = [{ nom: "", prenom: "" }];
    	var actionEncours = false;
    	var flagEmailVerifie = false;
    	var flagVerifEffacer = false;
    	var flagVerifDesinscription = false;
    	var flagComplet = false;
    	var flagSaveValide = false;
    	var flagEmailVide = false;
    	var flagEmailInvalide = false;
    	var busyEffacerInscription = false;
    	var confirmeDesinscription = false;
    	var busyEffacerInscrit = false;
    	var confirmeDesinscrit = false;
    	var confirmeInscription = false;
    	let saveInfo = false;
    	let idInscrit = "";
    	let modal;

    	if (localStorage["emailInscription"]) {
    		var emailInscription = JSON.parse(localStorage.getItem("emailInscription"));
    		saveInfo = true;
    	} else {
    		var emailInscription = "";
    	}

    	//récupération nb inscrits au montage
    	onMount(async () => {
    		var extracted = (/\?idInscription=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})&email=([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i).exec(urlModifInscription);
    		await tick();

    		if (extracted !== null) {
    			var idAtelierModif = extracted[1];
    			var emailModif = extracted[2];

    			if (idAtelierModif === id_atelier) {
    				$$invalidate(20, emailInscription = emailModif);

    				if (localStorage["emailInscription"]) {
    					$$invalidate(18, saveInfo = true);
    				}

    				afficheModal();
    				verifInscrits();
    			}
    		}

    		nbInscrits();
    	});

    	// appels graphql
    	async function nbInscrits() {
    		console.log("bobby ?", nbInscrits$1(id_atelier));

    		nbInscrits$1(id_atelier).then(retourNbPlaces => {
    			$$invalidate(3, nbPlaces = retourNbPlaces);
    			console.log("bob");
    			flagComplet = false;

    			if (nbPlaces === 0) {
    				$$invalidate(0, placesRestantes = "Complet");
    				flagComplet = true;
    				$$invalidate(4, nouveauxInscrits = []);
    			} else if (nbPlaces === 1) {
    				$$invalidate(0, placesRestantes = "Dernière place");
    			} else {
    				$$invalidate(0, placesRestantes = nbPlaces + " places restantes");
    			}
    		});
    	} //nbPlaces = await strapiInscriptions.nbInscrits(id_atelier)

    	async function verifInscrits() {
    		if (emailInscription === "") {
    			$$invalidate(11, flagEmailVide = true);
    			return;
    		}

    		if ((/([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i).exec(emailInscription) === null) {
    			$$invalidate(12, flagEmailInvalide = true);
    			return;
    		}

    		saveInfoEmail();
    		$$invalidate(6, actionEncours = true);

    		findOneInscrit(id_atelier, emailInscription).then(retour => {
    			const verifInscrits = JSON.parse(retour)[0];

    			if (verifInscrits) {
    				idInscrit = verifInscrits.id;
    			} else {
    				idInscrit = "pasInscrit";
    			}

    			if (verifInscrits && verifInscrits.lesInscrits) {
    				$$invalidate(2, listeInscrits = verifInscrits.lesInscrits);
    			}

    			if (listeInscrits.length > 0) {
    				$$invalidate(4, nouveauxInscrits = []);
    			} else {
    				$$invalidate(4, nouveauxInscrits = [{ prenom: "" }]);
    			}

    			$$invalidate(6, actionEncours = false);
    			$$invalidate(7, flagEmailVerifie = true);
    		});
    	}

    	async function insertInscrits() {
    		saveInfoEmail();

    		var insertInscriptions = {
    			"email": emailInscription,
    			"idAtelier": id_atelier,
    			"lesInscrits": []
    		};

    		var listeInscriptionsEmail = [];

    		listeInscrits.forEach(inscription => {
    			if (!(inscription.prenom === "" && inscription.nom === "")) {
    				insertInscriptions.lesInscrits.push({ "prenom": inscription.prenom });
    				listeInscriptionsEmail.push({ "prenom": inscription.prenom });
    			}
    		});

    		nouveauxInscrits.forEach(inscription => {
    			if (!(inscription.prenom === "" && inscription.nom === "")) {
    				insertInscriptions.lesInscrits.push({ "prenom": inscription.prenom });
    				listeInscriptionsEmail.push({ "prenom": inscription.prenom });
    			}
    		});

    		if (idInscrit === "pasInscrit") {
    			ajoutInscrits$1(insertInscriptions).then(retour => {
    				nbInscrits();
    				close();
    				$$invalidate(17, confirmeInscription = true);
    			});
    		} else {
    			modifInscription(idInscrit.toString(), insertInscriptions).then(retour => {
    				nbInscrits();
    				close();
    				$$invalidate(17, confirmeInscription = true);
    			});
    		}
    	} /* var arrayMails = []
    arrayMails.push(emailInscription)
    var infoMail = {
        subject: "Confirmation de votre inscription",
        titreAtelier: titre_atelier,
        date: date_atelier,
        participants: listeInscriptionsEmail,
        urlDesinscription: urlMail + "?idInscription=" + id_atelier +
            "&email=" + emailInscription,
        altMachine: "Illustration Atelier",
        urlImageMail: "https://res.cloudinary.com/la-bonne-fabrique/image/upload/ar_1.5,w_auto,c_fill/" + url_illustration
    };
    envoiMail(arrayMails, infoMail)*/

    	async function effacerInscription() {
    		if (idInscrit !== "pasInscrit") {
    			saveInfoEmail();
    			$$invalidate(13, busyEffacerInscription = true);
    			console.log("va effacer ", idInscrit);

    			effacerInscription$1(idInscrit.toString()).then(retour => {
    				nbInscrits();
    				$$invalidate(13, busyEffacerInscription = false);
    				close();
    				close();
    				$$invalidate(14, confirmeDesinscription = true);
    			}).catch(error => console.log("erreur effacer inscription\n", error));
    		}
    	}

    	async function effacerInscrit() {
    		saveInfoEmail();
    		$$invalidate(15, busyEffacerInscrit = true);
    		console.log("id desincrit", desinscrit.id);
    		var effacerInscritById$1 = await effacerInscritById(desinscrit.id);
    		nbInscrits();
    		$$invalidate(15, busyEffacerInscrit = false);
    		close();
    		close();
    		$$invalidate(16, confirmeDesinscrit = true);
    	}

    	// gestion table nouveaux inscrits
    	function confirmerEffaceInscrit(id, inscrit) {
    		$$invalidate(8, flagVerifEffacer = true);
    		$$invalidate(5, desinscrit = inscrit);
    		$$invalidate(5, desinscrit.id = id, desinscrit);
    	}

    	function dernierInscrit(index) {
    		return index + 1 === nouveauxInscrits.length;
    	}

    	function ajoutInscrit() {
    		if (nbPlaces - nouveauxInscrits.length > 0) nouveauxInscrits.push({ prenom: "" });
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function soustraitInscrit(index) {
    		nouveauxInscrits.splice(index, 1);
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function validationSave() {
    		var estValide = true;

    		//if (nouveauxInscrits.length === 0) {estValide = false}
    		listeInscrits.forEach(inscrit => {
    			if (inscrit.prenom === "") {
    				estValide = false;
    			}
    		});

    		nouveauxInscrits.forEach(inscrit => {
    			if (inscrit.prenom === "") {
    				estValide = false;
    			}
    		});

    		$$invalidate(10, flagSaveValide = estValide);
    	}

    	// sauvegarde mail en local
    	function saveInfoEmail() {
    		//verification si on doit poser une cookie ou l'enlever
    		if (saveInfo) {
    			localStorage.setItem("emailInscription", JSON.stringify(emailInscription));
    		}

    		if (!saveInfo && localStorage["emailInscription"]) {
    			localStorage.removeItem("emailInscription");
    		}
    	}

    	//modal
    	function afficheModal() {
    		$$invalidate(1, showModalInscription = true);
    	} //testModal = true

    	function close() {
    		if (confirmeInscription) {
    			$$invalidate(17, confirmeInscription = false);
    			return;
    		}

    		if (confirmeDesinscription) {
    			$$invalidate(14, confirmeDesinscription = false);
    			return;
    		}

    		if (confirmeDesinscrit) {
    			$$invalidate(16, confirmeDesinscrit = false);
    			return;
    		}

    		if (flagVerifEffacer || flagVerifDesinscription) {
    			$$invalidate(8, flagVerifEffacer = false);
    			$$invalidate(9, flagVerifDesinscription = false);
    		} else {
    			$$invalidate(1, showModalInscription = false);
    			$$invalidate(7, flagEmailVerifie = false);
    			$$invalidate(9, flagVerifDesinscription = false);
    		}
    	}

    	const handle_keydown = e => {
    		if (!showModalInscription) {
    			return;
    		}

    		if (e.key === "Escape") {
    			close();
    			return;
    		}

    		if (e.key === "Enter") {
    			ajoutInscrit();
    			e.preventDefault();
    		}
    	}; /*if (e.key === "Tab") {
            // trap focus
            console.log('modal', modal)
            const nodes = modal.querySelectorAll("*");
            console.log('nodes', nodes)
            const tabbable = Array.from(nodes).filter(n => n.tabIndex >= 0);
            console.log('tabbable', tabbable)
            let index = tabbable.indexOf(DocumentOrShadowRoot.activeElement);
            console.log('index', index)
      if (index === -1 && e.shiftKey) index = 0;
      index += tabbable.length + (e.shiftKey ? -1 : 1);
      index %= tabbable.length;
      tabbable[index].focus();
      e.preventDefault();
    }*/

    	const writable_props = ["id_atelier", "url_illustration", "date_atelier", "titre_atelier"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<une-inscription> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("une-inscription", $$slots, []);

    	const input_handler = () => {
    		$$invalidate(7, flagEmailVerifie = false);
    		$$invalidate(11, flagEmailVide = false);
    		$$invalidate(12, flagEmailInvalide = false);
    	};

    	function input0_input_handler() {
    		emailInscription = this.value;
    		$$invalidate(20, emailInscription);
    	}

    	function input1_change_handler() {
    		saveInfo = this.checked;
    		$$invalidate(18, saveInfo);
    	}

    	function input_input_handler(each_value_1, inscrit_index) {
    		each_value_1[inscrit_index].prenom = this.value;
    		$$invalidate(2, listeInscrits);
    	}

    	function input_input_handler_1(each_value, index) {
    		each_value[index].prenom = this.value;
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			modal = $$value;
    			$$invalidate(19, modal);
    		});
    	}

    	const click_handler = () => $$invalidate(9, flagVerifDesinscription = true);

    	$$self.$set = $$props => {
    		if ("id_atelier" in $$props) $$invalidate(32, id_atelier = $$props.id_atelier);
    		if ("url_illustration" in $$props) $$invalidate(33, url_illustration = $$props.url_illustration);
    		if ("date_atelier" in $$props) $$invalidate(34, date_atelier = $$props.date_atelier);
    		if ("titre_atelier" in $$props) $$invalidate(35, titre_atelier = $$props.titre_atelier);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		tick,
    		Modal: ModalPerso,
    		id_atelier,
    		url_illustration,
    		date_atelier,
    		titre_atelier,
    		urlModifInscription,
    		urlMail,
    		testModal,
    		placesRestantes,
    		showModalInscription,
    		listeInscrits,
    		nbPlaces,
    		nouveauxInscrits,
    		desinscrit,
    		actionEncours,
    		flagEmailVerifie,
    		flagVerifEffacer,
    		flagVerifDesinscription,
    		flagComplet,
    		flagSaveValide,
    		flagEmailVide,
    		flagEmailInvalide,
    		busyEffacerInscription,
    		confirmeDesinscription,
    		busyEffacerInscrit,
    		confirmeDesinscrit,
    		confirmeInscription,
    		saveInfo,
    		idInscrit,
    		modal,
    		emailInscription,
    		gestionInscriptions,
    		strapiInscriptions,
    		envoiMail,
    		nbInscrits,
    		verifInscrits,
    		insertInscrits,
    		effacerInscription,
    		effacerInscrit,
    		confirmerEffaceInscrit,
    		dernierInscrit,
    		ajoutInscrit,
    		soustraitInscrit,
    		validationSave,
    		saveInfoEmail,
    		afficheModal,
    		close,
    		handle_keydown
    	});

    	$$self.$inject_state = $$props => {
    		if ("id_atelier" in $$props) $$invalidate(32, id_atelier = $$props.id_atelier);
    		if ("url_illustration" in $$props) $$invalidate(33, url_illustration = $$props.url_illustration);
    		if ("date_atelier" in $$props) $$invalidate(34, date_atelier = $$props.date_atelier);
    		if ("titre_atelier" in $$props) $$invalidate(35, titre_atelier = $$props.titre_atelier);
    		if ("urlModifInscription" in $$props) urlModifInscription = $$props.urlModifInscription;
    		if ("urlMail" in $$props) urlMail = $$props.urlMail;
    		if ("testModal" in $$props) testModal = $$props.testModal;
    		if ("placesRestantes" in $$props) $$invalidate(0, placesRestantes = $$props.placesRestantes);
    		if ("showModalInscription" in $$props) $$invalidate(1, showModalInscription = $$props.showModalInscription);
    		if ("listeInscrits" in $$props) $$invalidate(2, listeInscrits = $$props.listeInscrits);
    		if ("nbPlaces" in $$props) $$invalidate(3, nbPlaces = $$props.nbPlaces);
    		if ("nouveauxInscrits" in $$props) $$invalidate(4, nouveauxInscrits = $$props.nouveauxInscrits);
    		if ("desinscrit" in $$props) $$invalidate(5, desinscrit = $$props.desinscrit);
    		if ("actionEncours" in $$props) $$invalidate(6, actionEncours = $$props.actionEncours);
    		if ("flagEmailVerifie" in $$props) $$invalidate(7, flagEmailVerifie = $$props.flagEmailVerifie);
    		if ("flagVerifEffacer" in $$props) $$invalidate(8, flagVerifEffacer = $$props.flagVerifEffacer);
    		if ("flagVerifDesinscription" in $$props) $$invalidate(9, flagVerifDesinscription = $$props.flagVerifDesinscription);
    		if ("flagComplet" in $$props) flagComplet = $$props.flagComplet;
    		if ("flagSaveValide" in $$props) $$invalidate(10, flagSaveValide = $$props.flagSaveValide);
    		if ("flagEmailVide" in $$props) $$invalidate(11, flagEmailVide = $$props.flagEmailVide);
    		if ("flagEmailInvalide" in $$props) $$invalidate(12, flagEmailInvalide = $$props.flagEmailInvalide);
    		if ("busyEffacerInscription" in $$props) $$invalidate(13, busyEffacerInscription = $$props.busyEffacerInscription);
    		if ("confirmeDesinscription" in $$props) $$invalidate(14, confirmeDesinscription = $$props.confirmeDesinscription);
    		if ("busyEffacerInscrit" in $$props) $$invalidate(15, busyEffacerInscrit = $$props.busyEffacerInscrit);
    		if ("confirmeDesinscrit" in $$props) $$invalidate(16, confirmeDesinscrit = $$props.confirmeDesinscrit);
    		if ("confirmeInscription" in $$props) $$invalidate(17, confirmeInscription = $$props.confirmeInscription);
    		if ("saveInfo" in $$props) $$invalidate(18, saveInfo = $$props.saveInfo);
    		if ("idInscrit" in $$props) idInscrit = $$props.idInscrit;
    		if ("modal" in $$props) $$invalidate(19, modal = $$props.modal);
    		if ("emailInscription" in $$props) $$invalidate(20, emailInscription = $$props.emailInscription);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		placesRestantes,
    		showModalInscription,
    		listeInscrits,
    		nbPlaces,
    		nouveauxInscrits,
    		desinscrit,
    		actionEncours,
    		flagEmailVerifie,
    		flagVerifEffacer,
    		flagVerifDesinscription,
    		flagSaveValide,
    		flagEmailVide,
    		flagEmailInvalide,
    		busyEffacerInscription,
    		confirmeDesinscription,
    		busyEffacerInscrit,
    		confirmeDesinscrit,
    		confirmeInscription,
    		saveInfo,
    		modal,
    		emailInscription,
    		verifInscrits,
    		insertInscrits,
    		effacerInscription,
    		effacerInscrit,
    		confirmerEffaceInscrit,
    		ajoutInscrit,
    		soustraitInscrit,
    		validationSave,
    		afficheModal,
    		close,
    		handle_keydown,
    		id_atelier,
    		url_illustration,
    		date_atelier,
    		titre_atelier,
    		input_handler,
    		input0_input_handler,
    		input1_change_handler,
    		input_input_handler,
    		input_input_handler_1,
    		div1_binding,
    		click_handler
    	];
    }

    class Inscriptions extends SvelteElement {
    	constructor(options) {
    		super();
    		this.shadowRoot.innerHTML = `<style>hr{box-sizing:content-box;height:0;overflow:visible}button,input{font-family:inherit;font-size:100%;line-height:1.15;margin:0}button,input{overflow:visible}button{text-transform:none}button,[type="button"]{-webkit-appearance:button}button::-moz-focus-inner,[type="button"]::-moz-focus-inner{border-style:none;padding:0}button:-moz-focusring,[type="button"]:-moz-focusring{outline:1px dotted ButtonText}[type="checkbox"]{box-sizing:border-box;padding:0}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}h2,hr{margin:0}button{background-color:transparent;background-image:none}button:focus{outline:1px dotted;outline:5px auto -webkit-focus-ring-color}ul{list-style:none;margin:0;padding:0}*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e2e8f0}hr{border-top-width:1px}input::-moz-placeholder{color:#a0aec0}input:-ms-input-placeholder{color:#a0aec0}input::-ms-input-placeholder{color:#a0aec0}input::placeholder{color:#a0aec0}button{cursor:pointer}h2{font-size:inherit;font-weight:inherit}button,input{padding:0;line-height:inherit;color:inherit}svg{display:block;vertical-align:middle}@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}@media not print{}@media print and (-ms-high-contrast: active), print and (-ms-high-contrast: none){}.form-checkbox:checked{background-image:url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M5.707 7.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4a1 1 0 0 0-1.414-1.414L7 8.586 5.707 7.293z'/%3e%3c/svg%3e");border-color:transparent;background-color:currentColor;background-size:100% 100%;background-position:center;background-repeat:no-repeat}@media not print{.form-checkbox::-ms-check{border-width:1px;color:transparent;background:inherit;border-color:inherit;border-radius:inherit}}.form-checkbox{-webkit-appearance:none;-moz-appearance:none;appearance:none;-webkit-print-color-adjust:exact;color-adjust:exact;display:inline-block;vertical-align:middle;background-origin:border-box;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;flex-shrink:0;height:1em;width:1em;color:#4299e1;background-color:#fff;border-color:#e2e8f0;border-width:1px;border-radius:0.25rem}.form-checkbox:focus{outline:none;box-shadow:0 0 0 3px rgba(66, 153, 225, 0.5);border-color:#63b3ed}@media not print{}.space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.divide-transparent>:not(template)~:not(template){border-color:transparent}.divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}.appearance-none{-webkit-appearance:none;-moz-appearance:none;appearance:none}.bg-black{--bg-opacity:1;background-color:#000;background-color:rgba(0, 0, 0, var(--bg-opacity))}.bg-white{--bg-opacity:1;background-color:#fff;background-color:rgba(255, 255, 255, var(--bg-opacity))}.bg-orangeLBF{--bg-opacity:1;background-color:#ee732e;background-color:rgba(238, 115, 46, var(--bg-opacity))}.focus\\:bg-white:focus{--bg-opacity:1;background-color:#fff;background-color:rgba(255, 255, 255, var(--bg-opacity))}.border-orangeLBF{--border-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--border-opacity))}.border-bleuLBF{--border-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--border-opacity))}.border-vertLBF{--border-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--border-opacity))}.border-lbfbleu-400{--border-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--border-opacity))}.border-lbfvert-400{--border-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--border-opacity))}.focus\\:border-lbfbleu-600:focus{--border-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--border-opacity))}.focus\\:border-lbfvert-600:focus{--border-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--border-opacity))}.rounded{border-radius:0.25rem}.rounded-lg{border-radius:0.5rem}.rounded-r{border-top-right-radius:0.25rem;border-bottom-right-radius:0.25rem}.border-2{border-width:2px}.border-b-2{border-bottom-width:2px}.cursor-pointer{cursor:pointer}.block{display:block}.flex{display:flex}.flex-row{flex-direction:row}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-start{align-items:flex-start}.items-center{align-items:center}.self-end{align-self:flex-end}.justify-start{justify-content:flex-start}.justify-end{justify-content:flex-end}.justify-center{justify-content:center}.content-center{align-content:center}.content-end{align-content:flex-end}.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.h-10{height:2.5rem}.h-12{height:3rem}.h-full{height:100%}.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}.text-base{font-size:1rem}.text-lg{font-size:1.125rem}.text-xl{font-size:1.25rem}.leading-normal{line-height:1.5}.list-disc{list-style-type:disc}.m-0{margin:0}.my-1{margin-top:0.25rem;margin-bottom:0.25rem}.mx-1{margin-left:0.25rem;margin-right:0.25rem}.mx-2{margin-left:0.5rem;margin-right:0.5rem}.mx-8{margin-left:2rem;margin-right:2rem}.my-auto{margin-top:auto;margin-bottom:auto}.mx-auto{margin-left:auto;margin-right:auto}.mt-1{margin-top:0.25rem}.mr-1{margin-right:0.25rem}.mb-1{margin-bottom:0.25rem}.ml-1{margin-left:0.25rem}.mt-2{margin-top:0.5rem}.mr-2{margin-right:0.5rem}.mt-3{margin-top:0.75rem}.mb-4{margin-bottom:1rem}.ml-4{margin-left:1rem}.ml-6{margin-left:1.5rem}.max-h-5\\/6{max-height:83%}.opacity-75{opacity:0.75}.focus\\:outline-none:focus{outline:0}.overflow-auto{overflow:auto}.p-0{padding:0}.p-4{padding:1rem}.px-1{padding-left:0.25rem;padding-right:0.25rem}.px-2{padding-left:0.5rem;padding-right:0.5rem}.px-4{padding-left:1rem;padding-right:1rem}.pb-1{padding-bottom:0.25rem}.pr-8{padding-right:2rem}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.top-0{top:0}.left-0{left:0}.fill-current{fill:currentColor}.stroke-current{stroke:currentColor}.text-justify{text-align:justify}.text-black{--text-opacity:1;color:#000;color:rgba(0, 0, 0, var(--text-opacity))}.text-orangeLBF{--text-opacity:1;color:#ee732e;color:rgba(238, 115, 46, var(--text-opacity))}.text-bleuLBF{--text-opacity:1;color:#4bbcc4;color:rgba(75, 188, 196, var(--text-opacity))}.text-vertLBF{--text-opacity:1;color:#93c021;color:rgba(147, 192, 33, var(--text-opacity))}.text-rougeLBF{--text-opacity:1;color:#e02933;color:rgba(224, 41, 51, var(--text-opacity))}.text-lbfbleu-600{--text-opacity:1;color:#3ea1aa;color:rgba(62, 161, 170, var(--text-opacity))}.text-lbfvert-500{--text-opacity:1;color:#93C021;color:rgba(147, 192, 33, var(--text-opacity))}.text-lbfvert-600{--text-opacity:1;color:#6d9d0b;color:rgba(109, 157, 11, var(--text-opacity))}.w-12{width:3rem}.w-20{width:5rem}.w-5\\/6{width:83.333333%}.w-full{width:100%}.z-100{z-index:100}@media(min-width: 640px){@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}.sm\\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.sm\\:space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.sm\\:space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.sm\\:space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.sm\\:space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.sm\\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.sm\\:space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.sm\\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.sm\\:space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.sm\\:space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.sm\\:space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.sm\\:space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.sm\\:space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.sm\\:space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.sm\\:space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.sm\\:space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.sm\\:space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.sm\\:space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.sm\\:space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.sm\\:space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.sm\\:space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.sm\\:space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.sm\\:space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.sm\\:space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.sm\\:space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.sm\\:space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.sm\\:space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.sm\\:space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.sm\\:space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.sm\\:space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.sm\\:space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.sm\\:-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.sm\\:-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.sm\\:-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.sm\\:-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.sm\\:-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.sm\\:-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.sm\\:-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.sm\\:-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.sm\\:-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.sm\\:-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.sm\\:-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.sm\\:-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.sm\\:-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.sm\\:-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.sm\\:-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.sm\\:-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.sm\\:-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.sm\\:-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.sm\\:-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.sm\\:-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.sm\\:-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.sm\\:-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.sm\\:-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.sm\\:-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.sm\\:-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.sm\\:-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.sm\\:-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.sm\\:-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.sm\\:-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.sm\\:-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.sm\\:space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.sm\\:space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.sm\\:divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.sm\\:divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.sm\\:divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.sm\\:divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.sm\\:divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.sm\\:divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.sm\\:divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.sm\\:divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.sm\\:divide-transparent>:not(template)~:not(template){border-color:transparent}.sm\\:divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.sm\\:divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.sm\\:divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.sm\\:divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.sm\\:divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.sm\\:divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.sm\\:divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.sm\\:divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.sm\\:divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.sm\\:divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.sm\\:divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.sm\\:divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.sm\\:divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.sm\\:divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.sm\\:divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.sm\\:divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.sm\\:divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.sm\\:divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.sm\\:divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.sm\\:divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.sm\\:divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.sm\\:divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.sm\\:divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.sm\\:divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.sm\\:divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.sm\\:divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.sm\\:divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.sm\\:divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.sm\\:divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.sm\\:divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.sm\\:divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.sm\\:divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.sm\\:divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.sm\\:divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.sm\\:divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.sm\\:divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.sm\\:divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.sm\\:divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.sm\\:divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.sm\\:divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.sm\\:divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.sm\\:divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.sm\\:divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.sm\\:divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.sm\\:divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.sm\\:divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.sm\\:divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.sm\\:divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.sm\\:divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.sm\\:divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.sm\\:divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.sm\\:divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.sm\\:divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.sm\\:divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.sm\\:divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.sm\\:divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.sm\\:divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.sm\\:divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.sm\\:divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.sm\\:divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.sm\\:divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.sm\\:divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.sm\\:divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.sm\\:divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.sm\\:divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.sm\\:divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.sm\\:divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.sm\\:divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.sm\\:divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.sm\\:divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.sm\\:divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.sm\\:divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.sm\\:divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}.sm\\:flex-row{flex-direction:row}.sm\\:h-8{height:2rem}.sm\\:text-xs{font-size:0.75rem}.sm\\:mr-2{margin-right:0.5rem}.sm\\:max-w-620px{max-width:620px}.sm\\:w-8{width:2rem}.sm\\:w-12{width:3rem}.sm\\:w-20{width:5rem}}@media(min-width: 768px){@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}.md\\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.md\\:space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.md\\:space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.md\\:space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.md\\:space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.md\\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.md\\:space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.md\\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.md\\:space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.md\\:space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.md\\:space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.md\\:space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.md\\:space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.md\\:space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.md\\:space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.md\\:space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.md\\:space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.md\\:space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.md\\:space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.md\\:space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.md\\:space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.md\\:space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.md\\:space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.md\\:space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.md\\:space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.md\\:space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.md\\:space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.md\\:space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.md\\:space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.md\\:space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.md\\:space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.md\\:space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.md\\:-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.md\\:-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.md\\:-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.md\\:-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.md\\:-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.md\\:-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.md\\:-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.md\\:-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.md\\:-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.md\\:-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.md\\:-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.md\\:-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.md\\:-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.md\\:-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.md\\:-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.md\\:-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.md\\:-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.md\\:-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.md\\:-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.md\\:-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.md\\:-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.md\\:-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.md\\:-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.md\\:-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.md\\:-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.md\\:-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.md\\:-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.md\\:-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.md\\:-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.md\\:-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.md\\:space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.md\\:space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.md\\:divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.md\\:divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.md\\:divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.md\\:divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.md\\:divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.md\\:divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.md\\:divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.md\\:divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.md\\:divide-transparent>:not(template)~:not(template){border-color:transparent}.md\\:divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.md\\:divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.md\\:divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.md\\:divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.md\\:divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.md\\:divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.md\\:divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.md\\:divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.md\\:divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.md\\:divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.md\\:divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.md\\:divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.md\\:divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.md\\:divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.md\\:divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.md\\:divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.md\\:divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.md\\:divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.md\\:divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.md\\:divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.md\\:divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.md\\:divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.md\\:divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.md\\:divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.md\\:divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.md\\:divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.md\\:divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.md\\:divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.md\\:divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.md\\:divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.md\\:divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.md\\:divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.md\\:divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.md\\:divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.md\\:divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.md\\:divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.md\\:divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.md\\:divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.md\\:divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.md\\:divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.md\\:divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.md\\:divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.md\\:divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.md\\:divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.md\\:divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.md\\:divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.md\\:divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.md\\:divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.md\\:divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.md\\:divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.md\\:divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.md\\:divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.md\\:divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.md\\:divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.md\\:divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.md\\:divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.md\\:divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.md\\:divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.md\\:divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.md\\:divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.md\\:divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.md\\:divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.md\\:divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.md\\:divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.md\\:divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.md\\:divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.md\\:divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.md\\:divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.md\\:divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.md\\:divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.md\\:divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.md\\:divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.md\\:divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}.md\\:flex-no-wrap{flex-wrap:nowrap}.md\\:h-8{height:2rem}.md\\:text-sm{font-size:0.875rem}.md\\:w-8{width:2rem}}@media(min-width: 1024px){@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}.lg\\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.lg\\:space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.lg\\:space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.lg\\:space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.lg\\:space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.lg\\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.lg\\:space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.lg\\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.lg\\:space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.lg\\:space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.lg\\:space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.lg\\:space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.lg\\:space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.lg\\:space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.lg\\:space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.lg\\:space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.lg\\:space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.lg\\:space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.lg\\:space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.lg\\:space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.lg\\:space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.lg\\:space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.lg\\:space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.lg\\:space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.lg\\:space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.lg\\:space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.lg\\:space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.lg\\:space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.lg\\:space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.lg\\:space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.lg\\:space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.lg\\:-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.lg\\:-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.lg\\:-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.lg\\:-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.lg\\:-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.lg\\:-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.lg\\:-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.lg\\:-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.lg\\:-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.lg\\:-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.lg\\:-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.lg\\:-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.lg\\:-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.lg\\:-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.lg\\:-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.lg\\:-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.lg\\:-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.lg\\:-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.lg\\:-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.lg\\:-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.lg\\:-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.lg\\:-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.lg\\:-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.lg\\:-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.lg\\:-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.lg\\:-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.lg\\:-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.lg\\:-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.lg\\:-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.lg\\:-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.lg\\:space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.lg\\:space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.lg\\:divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.lg\\:divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.lg\\:divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.lg\\:divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.lg\\:divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.lg\\:divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.lg\\:divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.lg\\:divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.lg\\:divide-transparent>:not(template)~:not(template){border-color:transparent}.lg\\:divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.lg\\:divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.lg\\:divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.lg\\:divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.lg\\:divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.lg\\:divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.lg\\:divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.lg\\:divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.lg\\:divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.lg\\:divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.lg\\:divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.lg\\:divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.lg\\:divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.lg\\:divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.lg\\:divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.lg\\:divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.lg\\:divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.lg\\:divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.lg\\:divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.lg\\:divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.lg\\:divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.lg\\:divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.lg\\:divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.lg\\:divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.lg\\:divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.lg\\:divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.lg\\:divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.lg\\:divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.lg\\:divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.lg\\:divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.lg\\:divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.lg\\:divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.lg\\:divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.lg\\:divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.lg\\:divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.lg\\:divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.lg\\:divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.lg\\:divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.lg\\:divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.lg\\:divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.lg\\:divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.lg\\:divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.lg\\:divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.lg\\:divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.lg\\:divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.lg\\:divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.lg\\:divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.lg\\:divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.lg\\:divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.lg\\:divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.lg\\:divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.lg\\:divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.lg\\:divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.lg\\:divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.lg\\:divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.lg\\:divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.lg\\:divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.lg\\:divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.lg\\:divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.lg\\:divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.lg\\:divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.lg\\:divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.lg\\:divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.lg\\:divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.lg\\:divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.lg\\:divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.lg\\:divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.lg\\:divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.lg\\:divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.lg\\:divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.lg\\:divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.lg\\:divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.lg\\:divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}}@media(min-width: 1280px){@media(min-width: 640px){}@media(min-width: 768px){}@media(min-width: 1024px){}@media(min-width: 1280px){}.xl\\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0px * var(--space-y-reverse))}.xl\\:space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px * var(--space-x-reverse));margin-left:calc(0px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.25rem * var(--space-y-reverse))}.xl\\:space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.25rem * var(--space-x-reverse));margin-left:calc(0.25rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem * var(--space-y-reverse))}.xl\\:space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem * var(--space-x-reverse));margin-left:calc(0.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem * var(--space-y-reverse))}.xl\\:space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem * var(--space-x-reverse));margin-left:calc(0.75rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1rem * var(--space-y-reverse))}.xl\\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem * var(--space-x-reverse));margin-left:calc(1rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.25rem * var(--space-y-reverse))}.xl\\:space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.25rem * var(--space-x-reverse));margin-left:calc(1.25rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem * var(--space-y-reverse))}.xl\\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem * var(--space-x-reverse));margin-left:calc(1.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2rem * var(--space-y-reverse))}.xl\\:space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2rem * var(--space-x-reverse));margin-left:calc(2rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(2.5rem * var(--space-y-reverse))}.xl\\:space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(2.5rem * var(--space-x-reverse));margin-left:calc(2.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3rem * var(--space-y-reverse))}.xl\\:space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3rem * var(--space-x-reverse));margin-left:calc(3rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(3.5rem * var(--space-y-reverse))}.xl\\:space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(3.5rem * var(--space-x-reverse));margin-left:calc(3.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(4rem * var(--space-y-reverse))}.xl\\:space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(4rem * var(--space-x-reverse));margin-left:calc(4rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(5rem * var(--space-y-reverse))}.xl\\:space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(5rem * var(--space-x-reverse));margin-left:calc(5rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(6rem * var(--space-y-reverse))}.xl\\:space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(6rem * var(--space-x-reverse));margin-left:calc(6rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(8rem * var(--space-y-reverse))}.xl\\:space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(8rem * var(--space-x-reverse));margin-left:calc(8rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10rem * var(--space-y-reverse))}.xl\\:space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10rem * var(--space-x-reverse));margin-left:calc(10rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(12rem * var(--space-y-reverse))}.xl\\:space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(12rem * var(--space-x-reverse));margin-left:calc(12rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(14rem * var(--space-y-reverse))}.xl\\:space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(14rem * var(--space-x-reverse));margin-left:calc(14rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(16rem * var(--space-y-reverse))}.xl\\:space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(16rem * var(--space-x-reverse));margin-left:calc(16rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(18rem * var(--space-y-reverse))}.xl\\:space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(18rem * var(--space-x-reverse));margin-left:calc(18rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(21rem * var(--space-y-reverse))}.xl\\:space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(21rem * var(--space-x-reverse));margin-left:calc(21rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(24rem * var(--space-y-reverse))}.xl\\:space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(24rem * var(--space-x-reverse));margin-left:calc(24rem * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(1px * var(--space-y-reverse))}.xl\\:space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1px * var(--space-x-reverse));margin-left:calc(1px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(10px * var(--space-y-reverse))}.xl\\:space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(10px * var(--space-x-reverse));margin-left:calc(10px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(200px * var(--space-y-reverse))}.xl\\:space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(200px * var(--space-x-reverse));margin-left:calc(200px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(40px * var(--space-y-reverse))}.xl\\:space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(40px * var(--space-x-reverse));margin-left:calc(40px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(340px * var(--space-y-reverse))}.xl\\:space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(340px * var(--space-x-reverse));margin-left:calc(340px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(180px * var(--space-y-reverse))}.xl\\:space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(180px * var(--space-x-reverse));margin-left:calc(180px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(480px * var(--space-y-reverse))}.xl\\:space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(480px * var(--space-x-reverse));margin-left:calc(480px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(640px * var(--space-y-reverse))}.xl\\:space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(640px * var(--space-x-reverse));margin-left:calc(640px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-1>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.25rem * var(--space-y-reverse))}.xl\\:-space-x-1>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.25rem * var(--space-x-reverse));margin-left:calc(-0.25rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.5rem * var(--space-y-reverse))}.xl\\:-space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.5rem * var(--space-x-reverse));margin-left:calc(-0.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-0.75rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-0.75rem * var(--space-y-reverse))}.xl\\:-space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-0.75rem * var(--space-x-reverse));margin-left:calc(-0.75rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1rem * var(--space-y-reverse))}.xl\\:-space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1rem * var(--space-x-reverse));margin-left:calc(-1rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-5>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.25rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.25rem * var(--space-y-reverse))}.xl\\:-space-x-5>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.25rem * var(--space-x-reverse));margin-left:calc(-1.25rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1.5rem * var(--space-y-reverse))}.xl\\:-space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1.5rem * var(--space-x-reverse));margin-left:calc(-1.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2rem * var(--space-y-reverse))}.xl\\:-space-x-8>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2rem * var(--space-x-reverse));margin-left:calc(-2rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-10>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-2.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-2.5rem * var(--space-y-reverse))}.xl\\:-space-x-10>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-2.5rem * var(--space-x-reverse));margin-left:calc(-2.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3rem * var(--space-y-reverse))}.xl\\:-space-x-12>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3rem * var(--space-x-reverse));margin-left:calc(-3rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-14>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-3.5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-3.5rem * var(--space-y-reverse))}.xl\\:-space-x-14>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-3.5rem * var(--space-x-reverse));margin-left:calc(-3.5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-16>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-4rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-4rem * var(--space-y-reverse))}.xl\\:-space-x-16>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-4rem * var(--space-x-reverse));margin-left:calc(-4rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-20>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-5rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-5rem * var(--space-y-reverse))}.xl\\:-space-x-20>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-5rem * var(--space-x-reverse));margin-left:calc(-5rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-24>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-6rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-6rem * var(--space-y-reverse))}.xl\\:-space-x-24>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-6rem * var(--space-x-reverse));margin-left:calc(-6rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-32>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-8rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-8rem * var(--space-y-reverse))}.xl\\:-space-x-32>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-8rem * var(--space-x-reverse));margin-left:calc(-8rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-40>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10rem * var(--space-y-reverse))}.xl\\:-space-x-40>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10rem * var(--space-x-reverse));margin-left:calc(-10rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-48>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-12rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-12rem * var(--space-y-reverse))}.xl\\:-space-x-48>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-12rem * var(--space-x-reverse));margin-left:calc(-12rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-56>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-14rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-14rem * var(--space-y-reverse))}.xl\\:-space-x-56>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-14rem * var(--space-x-reverse));margin-left:calc(-14rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-64>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-16rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-16rem * var(--space-y-reverse))}.xl\\:-space-x-64>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-16rem * var(--space-x-reverse));margin-left:calc(-16rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-72>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-18rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-18rem * var(--space-y-reverse))}.xl\\:-space-x-72>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-18rem * var(--space-x-reverse));margin-left:calc(-18rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-84>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-21rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-21rem * var(--space-y-reverse))}.xl\\:-space-x-84>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-21rem * var(--space-x-reverse));margin-left:calc(-21rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-96>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-24rem * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-24rem * var(--space-y-reverse))}.xl\\:-space-x-96>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-24rem * var(--space-x-reverse));margin-left:calc(-24rem * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-1px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-1px * var(--space-y-reverse))}.xl\\:-space-x-px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-1px * var(--space-x-reverse));margin-left:calc(-1px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-10px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-10px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-10px * var(--space-y-reverse))}.xl\\:-space-x-10px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-10px * var(--space-x-reverse));margin-left:calc(-10px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-200px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-200px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-200px * var(--space-y-reverse))}.xl\\:-space-x-200px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-200px * var(--space-x-reverse));margin-left:calc(-200px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-40px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-40px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-40px * var(--space-y-reverse))}.xl\\:-space-x-40px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-40px * var(--space-x-reverse));margin-left:calc(-40px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-340px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-340px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-340px * var(--space-y-reverse))}.xl\\:-space-x-340px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-340px * var(--space-x-reverse));margin-left:calc(-340px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-180px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-180px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-180px * var(--space-y-reverse))}.xl\\:-space-x-180px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-180px * var(--space-x-reverse));margin-left:calc(-180px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-480px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-480px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-480px * var(--space-y-reverse))}.xl\\:-space-x-480px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-480px * var(--space-x-reverse));margin-left:calc(-480px * calc(1 - var(--space-x-reverse)))}.xl\\:-space-y-640px>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(-640px * calc(1 - var(--space-y-reverse)));margin-bottom:calc(-640px * var(--space-y-reverse))}.xl\\:-space-x-640px>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(-640px * var(--space-x-reverse));margin-left:calc(-640px * calc(1 - var(--space-x-reverse)))}.xl\\:space-y-reverse>:not(template)~:not(template){--space-y-reverse:1}.xl\\:space-x-reverse>:not(template)~:not(template){--space-x-reverse:1}.xl\\:divide-y-0>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(0px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(0px * var(--divide-y-reverse))}.xl\\:divide-x-0>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(0px * var(--divide-x-reverse));border-left-width:calc(0px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y-2>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(2px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(2px * var(--divide-y-reverse))}.xl\\:divide-x-2>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(2px * var(--divide-x-reverse));border-left-width:calc(2px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y-4>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(4px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(4px * var(--divide-y-reverse))}.xl\\:divide-x-4>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(4px * var(--divide-x-reverse));border-left-width:calc(4px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y-8>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(8px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(8px * var(--divide-y-reverse))}.xl\\:divide-x-8>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(8px * var(--divide-x-reverse));border-left-width:calc(8px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px * calc(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px * var(--divide-y-reverse))}.xl\\:divide-x>:not(template)~:not(template){--divide-x-reverse:0;border-right-width:calc(1px * var(--divide-x-reverse));border-left-width:calc(1px * calc(1 - var(--divide-x-reverse)))}.xl\\:divide-y-reverse>:not(template)~:not(template){--divide-y-reverse:1}.xl\\:divide-x-reverse>:not(template)~:not(template){--divide-x-reverse:1}.xl\\:divide-transparent>:not(template)~:not(template){border-color:transparent}.xl\\:divide-black>:not(template)~:not(template){--divide-opacity:1;border-color:#000;border-color:rgba(0, 0, 0, var(--divide-opacity))}.xl\\:divide-white>:not(template)~:not(template){--divide-opacity:1;border-color:#fff;border-color:rgba(255, 255, 255, var(--divide-opacity))}.xl\\:divide-fondLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#FCFCFC;border-color:rgba(252, 252, 252, var(--divide-opacity))}.xl\\:divide-orangeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#ee732e;border-color:rgba(238, 115, 46, var(--divide-opacity))}.xl\\:divide-bleuLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#4bbcc4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.xl\\:divide-vertLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#93c021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.xl\\:divide-vertLBFT>:not(template)~:not(template){border-color:#93c02155}.xl\\:divide-rougeLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.xl\\:divide-jauneLBF>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.xl\\:divide-lbforange-50>:not(template)~:not(template){--divide-opacity:1;border-color:#FFF4E3;border-color:rgba(255, 244, 227, var(--divide-opacity))}.xl\\:divide-lbforange-100>:not(template)~:not(template){--divide-opacity:1;border-color:#FFE1B9;border-color:rgba(255, 225, 185, var(--divide-opacity))}.xl\\:divide-lbforange-200>:not(template)~:not(template){--divide-opacity:1;border-color:#FFCE8D;border-color:rgba(255, 206, 141, var(--divide-opacity))}.xl\\:divide-lbforange-300>:not(template)~:not(template){--divide-opacity:1;border-color:#ffba62;border-color:rgba(255, 186, 98, var(--divide-opacity))}.xl\\:divide-lbforange-400>:not(template)~:not(template){--divide-opacity:1;border-color:#ffab45;border-color:rgba(255, 171, 69, var(--divide-opacity))}.xl\\:divide-lbforange-500>:not(template)~:not(template){--divide-opacity:1;border-color:#ff9E36;border-color:rgba(255, 158, 54, var(--divide-opacity))}.xl\\:divide-lbforange-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fc9234;border-color:rgba(252, 146, 52, var(--divide-opacity))}.xl\\:divide-lbforange-700>:not(template)~:not(template){--divide-opacity:1;border-color:#f58331;border-color:rgba(245, 131, 49, var(--divide-opacity))}.xl\\:divide-lbforange-800>:not(template)~:not(template){--divide-opacity:1;border-color:#EE732E;border-color:rgba(238, 115, 46, var(--divide-opacity))}.xl\\:divide-lbforange-900>:not(template)~:not(template){--divide-opacity:1;border-color:#e25d2b;border-color:rgba(226, 93, 43, var(--divide-opacity))}.xl\\:divide-lbfbleu-50>:not(template)~:not(template){--divide-opacity:1;border-color:#e1f6f6;border-color:rgba(225, 246, 246, var(--divide-opacity))}.xl\\:divide-lbfbleu-100>:not(template)~:not(template){--divide-opacity:1;border-color:#b4e7e9;border-color:rgba(180, 231, 233, var(--divide-opacity))}.xl\\:divide-lbfbleu-200>:not(template)~:not(template){--divide-opacity:1;border-color:#87d8db;border-color:rgba(135, 216, 219, var(--divide-opacity))}.xl\\:divide-lbfbleu-300>:not(template)~:not(template){--divide-opacity:1;border-color:#60c7ce;border-color:rgba(96, 199, 206, var(--divide-opacity))}.xl\\:divide-lbfbleu-400>:not(template)~:not(template){--divide-opacity:1;border-color:#4BBCC4;border-color:rgba(75, 188, 196, var(--divide-opacity))}.xl\\:divide-lbfbleu-500>:not(template)~:not(template){--divide-opacity:1;border-color:#42b1bc;border-color:rgba(66, 177, 188, var(--divide-opacity))}.xl\\:divide-lbfbleu-600>:not(template)~:not(template){--divide-opacity:1;border-color:#3ea1aa;border-color:rgba(62, 161, 170, var(--divide-opacity))}.xl\\:divide-lbfbleu-700>:not(template)~:not(template){--divide-opacity:1;border-color:#398c92;border-color:rgba(57, 140, 146, var(--divide-opacity))}.xl\\:divide-lbfbleu-800>:not(template)~:not(template){--divide-opacity:1;border-color:#34787b;border-color:rgba(52, 120, 123, var(--divide-opacity))}.xl\\:divide-lbfbleu-900>:not(template)~:not(template){--divide-opacity:1;border-color:#285554;border-color:rgba(40, 85, 84, var(--divide-opacity))}.xl\\:divide-lbfvert-50>:not(template)~:not(template){--divide-opacity:1;border-color:#f3f7e6;border-color:rgba(243, 247, 230, var(--divide-opacity))}.xl\\:divide-lbfvert-100>:not(template)~:not(template){--divide-opacity:1;border-color:#e0ecc0;border-color:rgba(224, 236, 192, var(--divide-opacity))}.xl\\:divide-lbfvert-200>:not(template)~:not(template){--divide-opacity:1;border-color:#cbdf98;border-color:rgba(203, 223, 152, var(--divide-opacity))}.xl\\:divide-lbfvert-300>:not(template)~:not(template){--divide-opacity:1;border-color:#b5d36d;border-color:rgba(181, 211, 109, var(--divide-opacity))}.xl\\:divide-lbfvert-400>:not(template)~:not(template){--divide-opacity:1;border-color:#a4c94a;border-color:rgba(164, 201, 74, var(--divide-opacity))}.xl\\:divide-lbfvert-500>:not(template)~:not(template){--divide-opacity:1;border-color:#93C021;border-color:rgba(147, 192, 33, var(--divide-opacity))}.xl\\:divide-lbfvert-600>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.xl\\:divide-lbfvert-700>:not(template)~:not(template){--divide-opacity:1;border-color:#6d9d0b;border-color:rgba(109, 157, 11, var(--divide-opacity))}.xl\\:divide-lbfvert-800>:not(template)~:not(template){--divide-opacity:1;border-color:#588900;border-color:rgba(88, 137, 0, var(--divide-opacity))}.xl\\:divide-lbfvert-900>:not(template)~:not(template){--divide-opacity:1;border-color:#316800;border-color:rgba(49, 104, 0, var(--divide-opacity))}.xl\\:divide-lbfrouge-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fce6e7;border-color:rgba(252, 230, 231, var(--divide-opacity))}.xl\\:divide-lbfrouge-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7c0c4;border-color:rgba(247, 192, 196, var(--divide-opacity))}.xl\\:divide-lbfrouge-200>:not(template)~:not(template){--divide-opacity:1;border-color:#f1979c;border-color:rgba(241, 151, 156, var(--divide-opacity))}.xl\\:divide-lbfrouge-300>:not(template)~:not(template){--divide-opacity:1;border-color:#eb6d74;border-color:rgba(235, 109, 116, var(--divide-opacity))}.xl\\:divide-lbfrouge-400>:not(template)~:not(template){--divide-opacity:1;border-color:#e74d57;border-color:rgba(231, 77, 87, var(--divide-opacity))}.xl\\:divide-lbfrouge-500>:not(template)~:not(template){--divide-opacity:1;border-color:#e32e39;border-color:rgba(227, 46, 57, var(--divide-opacity))}.xl\\:divide-lbfrouge-600>:not(template)~:not(template){--divide-opacity:1;border-color:#e02933;border-color:rgba(224, 41, 51, var(--divide-opacity))}.xl\\:divide-lbfrouge-700>:not(template)~:not(template){--divide-opacity:1;border-color:#dc232c;border-color:rgba(220, 35, 44, var(--divide-opacity))}.xl\\:divide-lbfrouge-800>:not(template)~:not(template){--divide-opacity:1;border-color:#d81d24;border-color:rgba(216, 29, 36, var(--divide-opacity))}.xl\\:divide-lbfrouge-900>:not(template)~:not(template){--divide-opacity:1;border-color:#d01217;border-color:rgba(208, 18, 23, var(--divide-opacity))}.xl\\:divide-lbfjaune-50>:not(template)~:not(template){--divide-opacity:1;border-color:#fffee7;border-color:rgba(255, 254, 231, var(--divide-opacity))}.xl\\:divide-lbfjaune-100>:not(template)~:not(template){--divide-opacity:1;border-color:#fefac4;border-color:rgba(254, 250, 196, var(--divide-opacity))}.xl\\:divide-lbfjaune-200>:not(template)~:not(template){--divide-opacity:1;border-color:#fdf69d;border-color:rgba(253, 246, 157, var(--divide-opacity))}.xl\\:divide-lbfjaune-300>:not(template)~:not(template){--divide-opacity:1;border-color:#fcf275;border-color:rgba(252, 242, 117, var(--divide-opacity))}.xl\\:divide-lbfjaune-400>:not(template)~:not(template){--divide-opacity:1;border-color:#f9ed55;border-color:rgba(249, 237, 85, var(--divide-opacity))}.xl\\:divide-lbfjaune-500>:not(template)~:not(template){--divide-opacity:1;border-color:#f6e833;border-color:rgba(246, 232, 51, var(--divide-opacity))}.xl\\:divide-lbfjaune-600>:not(template)~:not(template){--divide-opacity:1;border-color:#fddd36;border-color:rgba(253, 221, 54, var(--divide-opacity))}.xl\\:divide-lbfjaune-700>:not(template)~:not(template){--divide-opacity:1;border-color:#fcc62d;border-color:rgba(252, 198, 45, var(--divide-opacity))}.xl\\:divide-lbfjaune-800>:not(template)~:not(template){--divide-opacity:1;border-color:#fbad24;border-color:rgba(251, 173, 36, var(--divide-opacity))}.xl\\:divide-lbfjaune-900>:not(template)~:not(template){--divide-opacity:1;border-color:#f78413;border-color:rgba(247, 132, 19, var(--divide-opacity))}.xl\\:divide-gray-100>:not(template)~:not(template){--divide-opacity:1;border-color:#f7fafc;border-color:rgba(247, 250, 252, var(--divide-opacity))}.xl\\:divide-gray-200>:not(template)~:not(template){--divide-opacity:1;border-color:#edf2f7;border-color:rgba(237, 242, 247, var(--divide-opacity))}.xl\\:divide-gray-300>:not(template)~:not(template){--divide-opacity:1;border-color:#e2e8f0;border-color:rgba(226, 232, 240, var(--divide-opacity))}.xl\\:divide-gray-400>:not(template)~:not(template){--divide-opacity:1;border-color:#cbd5e0;border-color:rgba(203, 213, 224, var(--divide-opacity))}.xl\\:divide-gray-500>:not(template)~:not(template){--divide-opacity:1;border-color:#a0aec0;border-color:rgba(160, 174, 192, var(--divide-opacity))}.xl\\:divide-gray-600>:not(template)~:not(template){--divide-opacity:1;border-color:#718096;border-color:rgba(113, 128, 150, var(--divide-opacity))}.xl\\:divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74, 85, 104, var(--divide-opacity))}.xl\\:divide-gray-800>:not(template)~:not(template){--divide-opacity:1;border-color:#2d3748;border-color:rgba(45, 55, 72, var(--divide-opacity))}.xl\\:divide-gray-900>:not(template)~:not(template){--divide-opacity:1;border-color:#1a202c;border-color:rgba(26, 32, 44, var(--divide-opacity))}.xl\\:divide-opacity-0>:not(template)~:not(template){--divide-opacity:0}.xl\\:divide-opacity-25>:not(template)~:not(template){--divide-opacity:0.25}.xl\\:divide-opacity-50>:not(template)~:not(template){--divide-opacity:0.5}.xl\\:divide-opacity-75>:not(template)~:not(template){--divide-opacity:0.75}.xl\\:divide-opacity-100>:not(template)~:not(template){--divide-opacity:1}}</style>`;

    		init(
    			this,
    			{ target: this.shadowRoot },
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				id_atelier: 32,
    				url_illustration: 33,
    				date_atelier: 34,
    				titre_atelier: 35
    			},
    			[-1, -1]
    		);

    		if (options) {
    			if (options.target) {
    				insert_dev(options.target, this, options.anchor);
    			}

    			if (options.props) {
    				this.$set(options.props);
    				flush();
    			}
    		}
    	}

    	static get observedAttributes() {
    		return ["id_atelier", "url_illustration", "date_atelier", "titre_atelier"];
    	}

    	get id_atelier() {
    		return this.$$.ctx[32];
    	}

    	set id_atelier(id_atelier) {
    		this.$set({ id_atelier });
    		flush();
    	}

    	get url_illustration() {
    		return this.$$.ctx[33];
    	}

    	set url_illustration(url_illustration) {
    		this.$set({ url_illustration });
    		flush();
    	}

    	get date_atelier() {
    		return this.$$.ctx[34];
    	}

    	set date_atelier(date_atelier) {
    		this.$set({ date_atelier });
    		flush();
    	}

    	get titre_atelier() {
    		return this.$$.ctx[35];
    	}

    	set titre_atelier(titre_atelier) {
    		this.$set({ titre_atelier });
    		flush();
    	}
    }

    customElements.define("une-inscription", Inscriptions);

    exports.appInscription = Inscriptions;

    return exports;

}({}));
//# sourceMappingURL=inscriptionAteliers.js.map
