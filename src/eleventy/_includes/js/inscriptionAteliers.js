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
        if (value != null || input.value) {
            input.value = value;
        }
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

    const globals = (typeof window !== 'undefined' ? window : global);

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
            block.m(node, next, lookup.has(block.key));
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
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.20.1' }, detail)));
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
        if (text.data === data)
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

    /* src/svelte/components/ModalPerso.svelte generated by Svelte v3.20.1 */
    const file = "src/svelte/components/ModalPerso.svelte";

    // (56:16) {#if has_bouton_bleu}
    function create_if_block(ctx) {
    	let button;
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
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, button, anchor);
    			if_block.m(button, null);
    			if (remount) dispose();
    			dispose = listen_dev(button, "click", /*click_handler*/ ctx[10], false, false, false);
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
    		m: function mount(target, anchor, remount) {
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
    			/*div3_binding*/ ctx[11](div3);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(window, "keydown", /*handle_keydown*/ ctx[5], false, false, false),
    				listen_dev(div0, "click", /*close*/ ctx[3], false, false, false),
    				listen_dev(button, "click", /*close*/ ctx[3], false, false, false)
    			];
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
    			/*div3_binding*/ ctx[11](null);
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
    			$$invalidate(2, modal = $$value);
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
    		actionEncours,
    		component,
    		svelteDispatch,
    		dispatch,
    		click_handler,
    		div3_binding
    	];
    }

    class ModalPerso extends SvelteElement {
    	constructor(options) {
    		super();
    		this.shadowRoot.innerHTML = `<style>button{font-family:inherit;font-size:100%;line-height:1.15;margin:0}button{overflow:visible}button{text-transform:none}button{-webkit-appearance:button}button::-moz-focus-inner{border-style:none;padding:0}button:-moz-focusring{outline:1px dotted ButtonText}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}*,:after,:before{box-sizing:inherit}h2{margin:0}button{background:transparent;padding:0}button:focus{outline:1px dotted;outline:5px auto -webkit-focus-ring-color}*,:after,:before{border:0 solid #e2e8f0}button{cursor:pointer}h2{font-size:inherit;font-weight:inherit}button{padding:0;line-height:inherit;color:inherit}svg{display:block;vertical-align:middle}@media(min-width:640px){}@media(min-width:768px){}@media(min-width:1024px){}@media(min-width:1280px){}@media not print{}@media print and (-ms-high-contrast:active),print and (-ms-high-contrast:none){}@media not print{}@media not print{}.bg-black{background-color:#000}.bg-white{background-color:#fff}.border-orangeLBF{border-color:#ee732e}.border-bleuLBF{border-color:#4bbcc4}.rounded{border-radius:.25rem}.border-2{border-width:2px}.border-b-2{border-bottom-width:2px}.cursor-pointer{cursor:pointer}.flex{display:-webkit-box;display:flex}.items-center{-webkit-box-align:center;align-items:center}.justify-end{-webkit-box-pack:end;justify-content:flex-end}.justify-center{-webkit-box-pack:center;justify-content:center}.font-medium{font-weight:500}.font-bold{font-weight:700}.h-8{height:2rem}.h-10{height:2.5rem}.h-full{height:100%}.mx-1{margin-left:.25rem;margin-right:.25rem}.mx-2{margin-left:.5rem;margin-right:.5rem}.mx-auto{margin-left:auto;margin-right:auto}.mt-1{margin-top:.25rem}.mb-1{margin-bottom:.25rem}.mt-3{margin-top:.75rem}.max-w-5\\/6{max-width:83%}.opacity-75{opacity:.75}.overflow-auto{overflow:auto}.p-2{padding:.5rem}.px-1{padding-left:.25rem;padding-right:.25rem}.pb-1{padding-bottom:.25rem}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.top-0{top:0}.left-0{left:0}.fill-current{fill:currentColor}.stroke-current{stroke:currentColor}.text-orangeLBF{color:#ee732e}.text-bleuLBF{color:#4bbcc4}.text-base{font-size:1rem}.text-xl{font-size:1.25rem}.w-8{width:2rem}.w-24{width:6rem}.w-full{width:100%}.z-100{z-index:100}@media(min-width:640px){}@media(min-width:768px){}@media(min-width:1024px){}</style>`;
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
      });
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

    async function envoiMail(arrayMails, infoMail) {
        const mutation = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
              method: "POST",
              body: JSON.stringify({
                query: `
                mutation envoiMail($email: [String!]!, $template: String) {
                    sendEmail(
                    from: "atelierdusappey@gmail.com"
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

    /* src/svelte/inscriptions/inscriptions.svelte generated by Svelte v3.20.1 */

    const { console: console_1, window: window_1 } = globals;
    const file$1 = "src/svelte/inscriptions/inscriptions.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[52] = list[i];
    	child_ctx[53] = list;
    	child_ctx[54] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[55] = list[i];
    	child_ctx[56] = list;
    	child_ctx[57] = i;
    	return child_ctx;
    }

    // (253:0) {#if showModalInscription}
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
    			add_location(div0, file$1, 254, 1, 9240);
    			attr_dev(h2, "class", "text-xl w-full pb-1 mb-1 border-b-2 border-vertLBF font-bold");
    			add_location(h2, file$1, 257, 2, 9502);
    			attr_dev(hr, "class", "mb-1");
    			add_location(hr, file$1, 260, 2, 9607);
    			attr_dev(div1, "class", "mb-1 text-base font-medium text-justify");
    			add_location(div1, file$1, 261, 2, 9629);
    			attr_dev(div2, "class", "ml-1 text-xs m-0 p-0 font-medium text-vertLBF");
    			add_location(div2, file$1, 267, 20, 9959);
    			attr_dev(input0, "class", "h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfvert-600 border-2 border-lbfvert-400 rounded-lg px-4 block appearance-none leading-normal");
    			attr_dev(input0, "type", "email");
    			attr_dev(input0, "placeholder", "adresse email");
    			add_location(input0, file$1, 270, 20, 10096);
    			attr_dev(div3, "class", "flex flex-col mt-1");
    			add_location(div3, file$1, 266, 16, 9906);
    			attr_dev(div4, "class", "m-0 p-0 mt-1 self-end");
    			add_location(div4, file$1, 273, 16, 10497);
    			attr_dev(div5, "class", "flex flex-row flex-wrap md:flex-no-wrap justify-start content-end");
    			add_location(div5, file$1, 265, 12, 9810);
    			attr_dev(input1, "type", "checkbox");
    			attr_dev(input1, "class", "form-checkbox text-lbfvert-600");
    			add_location(input1, file$1, 305, 16, 12768);
    			attr_dev(label, "class", "mx-8 pr-8 my-1 text-sm");
    			add_location(label, file$1, 304, 12, 12713);
    			attr_dev(div6, "class", "flex flex-col");
    			add_location(div6, file$1, 264, 8, 9770);
    			attr_dev(div7, "class", "relative overflow-auto max-h-5/6 w-5/6 sm:max-w-620px bg-white flex flex-col p-4 items-start rounded");
    			attr_dev(div7, "role", "dialog");
    			attr_dev(div7, "aria-modal", "true");
    			add_location(div7, file$1, 256, 1, 9352);
    			attr_dev(div8, "class", "z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center");
    			add_location(div8, file$1, 253, 0, 9153);
    		},
    		m: function mount(target, anchor, remount) {
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
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(div0, "click", /*close*/ ctx[30], false, false, false),
    				listen_dev(input0, "input", /*input_handler*/ ctx[43], false, false, false),
    				listen_dev(input0, "input", /*input0_input_handler*/ ctx[44]),
    				listen_dev(input1, "change", /*input1_change_handler*/ ctx[45])
    			];
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
    				if (!if_block1) {
    					if_block1 = create_if_block_15(ctx);
    					if_block1.c();
    					if_block1.m(div5, t10);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*flagEmailInvalide*/ ctx[12]) {
    				if (!if_block2) {
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
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(253:0) {#if showModalInscription}",
    		ctx
    	});

    	return block;
    }

    // (288:48) 
    function create_if_block_17(ctx) {
    	let button;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Vérifier";
    			attr_dev(button, "class", "w-full sm:w-20 mx-1 px-2 h-10 border-2 border-vertLBF rounded text-vertLBF font-semibold");
    			attr_dev(button, "type", "button");
    			add_location(button, file$1, 288, 24, 11950);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, button, anchor);
    			if (remount) dispose();
    			dispose = listen_dev(button, "click", /*verifInscrits*/ ctx[21], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_17.name,
    		type: "if",
    		source: "(288:48) ",
    		ctx
    	});

    	return block;
    }

    // (275:20) {#if actionEncours}
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
    			add_location(animate0, file$1, 278, 36, 10894);
    			attr_dev(animate1, "attributeName", "stroke-opacity");
    			attr_dev(animate1, "begin", "0s");
    			attr_dev(animate1, "dur", "1.8s");
    			attr_dev(animate1, "values", "1; 0");
    			attr_dev(animate1, "calcMode", "spline");
    			attr_dev(animate1, "keyTimes", "0; 1");
    			attr_dev(animate1, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate1, "repeatCount", "indefinite");
    			add_location(animate1, file$1, 279, 36, 11089);
    			attr_dev(circle0, "cx", "22");
    			attr_dev(circle0, "cy", "22");
    			attr_dev(circle0, "r", "1");
    			add_location(circle0, file$1, 277, 32, 10827);
    			attr_dev(animate2, "attributeName", "r");
    			attr_dev(animate2, "begin", "-0.9s");
    			attr_dev(animate2, "dur", "1.8s");
    			attr_dev(animate2, "values", "1; 20");
    			attr_dev(animate2, "calcMode", "spline");
    			attr_dev(animate2, "keyTimes", "0; 1");
    			attr_dev(animate2, "keySplines", "0.165, 0.84, 0.44, 1");
    			attr_dev(animate2, "repeatCount", "indefinite");
    			add_location(animate2, file$1, 282, 36, 11400);
    			attr_dev(animate3, "attributeName", "stroke-opacity");
    			attr_dev(animate3, "begin", "-0.9s");
    			attr_dev(animate3, "dur", "1.8s");
    			attr_dev(animate3, "values", "1; 0");
    			attr_dev(animate3, "calcMode", "spline");
    			attr_dev(animate3, "keyTimes", "0; 1");
    			attr_dev(animate3, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate3, "repeatCount", "indefinite");
    			add_location(animate3, file$1, 283, 36, 11598);
    			attr_dev(circle1, "cx", "22");
    			attr_dev(circle1, "cy", "22");
    			attr_dev(circle1, "r", "1");
    			add_location(circle1, file$1, 281, 32, 11333);
    			attr_dev(g, "fill", "none");
    			attr_dev(g, "fill-rule", "evenodd");
    			attr_dev(g, "stroke-width", "2");
    			add_location(g, file$1, 276, 28, 10742);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "class", "stroke-current text-lbfvert-500 h-10 w-18 ml-4 ");
    			attr_dev(svg, "viewBox", "0 0 50 50");
    			add_location(svg, file$1, 275, 24, 10597);
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
    		source: "(275:20) {#if actionEncours}",
    		ctx
    	});

    	return block;
    }

    // (294:16) {#if flagEmailVide}
    function create_if_block_15(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Veuillez entrer une adresse email pour démarrer l'inscription.";
    			attr_dev(div, "class", "m-0 p-0 mt-1 self-end text-rougeLBF");
    			add_location(div, file$1, 294, 20, 12271);
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
    		source: "(294:16) {#if flagEmailVide}",
    		ctx
    	});

    	return block;
    }

    // (299:16) {#if flagEmailInvalide}
    function create_if_block_14(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Veuillez entrer une adresse email valide.";
    			attr_dev(div, "class", "m-0 p-0 mt-1 self-end text-rougeLBF");
    			add_location(div, file$1, 299, 20, 12517);
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
    		source: "(299:16) {#if flagEmailInvalide}",
    		ctx
    	});

    	return block;
    }

    // (322:8) {:else}
    function create_else_block$1(ctx) {
    	let div0;
    	let t1;
    	let t2;
    	let div1;
    	let each_blocks = [];
    	let each1_lookup = new Map();
    	let t3;
    	let t4;
    	let div2;
    	let t5;
    	let t6;
    	let each_value_1 = /*listeInscrits*/ ctx[2];
    	validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*nouveauxInscrits*/ ctx[4];
    	validate_each_argument(each_value);
    	const get_key = ctx => "nI" + /*index*/ ctx[54];
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
    			if (if_block0) if_block0.c();
    			t4 = space();
    			div2 = element("div");
    			if (if_block1) if_block1.c();
    			t5 = space();
    			if (if_block2) if_block2.c();
    			t6 = space();
    			if (if_block3) if_block3.c();
    			attr_dev(div0, "class", "text-lg font-bold mt-2 text-bleuLBF");
    			add_location(div0, file$1, 322, 6, 13847);
    			add_location(div1, file$1, 346, 12, 15785);
    			add_location(div2, file$1, 379, 12, 18579);
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

    			/*div1_binding*/ ctx[50](div1);
    			insert_dev(target, t3, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, div2, anchor);
    			if (if_block1) if_block1.m(div2, null);
    			append_dev(div2, t5);
    			if (if_block2) if_block2.m(div2, null);
    			append_dev(div2, t6);
    			if (if_block3) if_block3.m(div2, null);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*confirmerEffaceInscrit, listeInscrits*/ 33554436) {
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

    			if (/*nbPlaces*/ ctx[3] - /*nouveauxInscrits*/ ctx[4].length === 0) {
    				if (!if_block0) {
    					if_block0 = create_if_block_11(ctx);
    					if_block0.c();
    					if_block0.m(t4.parentNode, t4);
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
    					if_block1.m(div2, t5);
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
    					if_block2.m(div2, t6);
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

    			/*div1_binding*/ ctx[50](null);
    			if (detaching) detach_dev(t3);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t4);
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
    		source: "(322:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (318:57) 
    function create_if_block_7(ctx) {
    	let h2;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "Cet atelier est complet. Nos ateliers sont régulièrement proposés, surveillez cet espace pour le prochain.";
    			attr_dev(h2, "class", "text-base text-bleuLBF w-full mt-2 mx-2 pb-1 mb-1 font-bold");
    			add_location(h2, file$1, 318, 12, 13611);
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
    		source: "(318:57) ",
    		ctx
    	});

    	return block;
    }

    // (310:8) {#if !flagEmailVerifie}
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
    			add_location(li0, file$1, 313, 20, 13218);
    			add_location(li1, file$1, 314, 20, 13380);
    			attr_dev(ul, "class", "list-disc ml-6");
    			add_location(ul, file$1, 312, 16, 13170);
    			attr_dev(div, "class", "text-base text-justify");
    			add_location(div, file$1, 310, 12, 13057);
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
    		source: "(310:8) {#if !flagEmailVerifie}",
    		ctx
    	});

    	return block;
    }

    // (338:16) {#if listeInscrits.length > 1}
    function create_if_block_13(ctx) {
    	let div;
    	let svg;
    	let path;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M268 416h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12zM432 80h-82.41l-34-56.7A48 48 0 00274.41 0H173.59a48 48 0 00-41.16 23.3L98.41 80H16A16 16 0 000 96v16a16 16 0 0016 16h16v336a48 48 0 0048 48h288a48 48 0 0048-48V128h16a16 16 0 0016-16V96a16 16 0 00-16-16zM171.84 50.91A6 6 0 01177 48h94a6 6 0 015.15 2.91L293.61 80H154.39zM368 464H80V128h288zm-212-48h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12z");
    			add_location(path, file$1, 340, 6, 15203);
    			attr_dev(svg, "class", "mx-auto cursor-pointer mt-3 h-12 w-12 sm:h-8 sm:w-8 stroke-current text-lbfbleu-600");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "data-prefix", "far");
    			attr_dev(svg, "data-icon", "trash-alt");
    			attr_dev(svg, "viewBox", "0 0 448 512");
    			add_location(svg, file$1, 339, 5, 14928);
    			attr_dev(div, "class", "my-auto sm:w-12 w-20");
    			add_location(div, file$1, 338, 4, 14888);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, path);
    			if (remount) dispose();

    			dispose = listen_dev(
    				svg,
    				"click",
    				function () {
    					if (is_function(/*confirmerEffaceInscrit*/ ctx[25](/*inscrit*/ ctx[55].id, /*inscrit*/ ctx[55]))) /*confirmerEffaceInscrit*/ ctx[25](/*inscrit*/ ctx[55].id, /*inscrit*/ ctx[55]).apply(this, arguments);
    				},
    				false,
    				false,
    				false
    			);
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_13.name,
    		type: "if",
    		source: "(338:16) {#if listeInscrits.length > 1}",
    		ctx
    	});

    	return block;
    }

    // (324:3) {#each listeInscrits as inscrit}
    function create_each_block_1(ctx) {
    	let div5;
    	let div4;
    	let div1;
    	let div0;
    	let t1;
    	let input0;
    	let t2;
    	let div3;
    	let div2;
    	let t4;
    	let input1;
    	let t5;
    	let dispose;

    	function input0_input_handler_1() {
    		/*input0_input_handler_1*/ ctx[46].call(input0, /*inscrit*/ ctx[55]);
    	}

    	function input1_input_handler() {
    		/*input1_input_handler*/ ctx[47].call(input1, /*inscrit*/ ctx[55]);
    	}

    	let if_block = /*listeInscrits*/ ctx[2].length > 1 && create_if_block_13(ctx);

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = "Prénom";
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			div3 = element("div");
    			div2 = element("div");
    			div2.textContent = "Nom";
    			t4 = space();
    			input1 = element("input");
    			t5 = space();
    			if (if_block) if_block.c();
    			attr_dev(div0, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div0, file$1, 327, 6, 14120);
    			attr_dev(input0, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "placeholder", "prenom");
    			add_location(input0, file$1, 328, 6, 14198);
    			attr_dev(div1, "class", "flex flex-col sm:mr-2");
    			add_location(div1, file$1, 326, 5, 14078);
    			attr_dev(div2, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div2, file$1, 332, 6, 14501);
    			attr_dev(input1, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "placeholder", "nom");
    			add_location(input1, file$1, 333, 6, 14576);
    			attr_dev(div3, "class", "flex flex-col sm:mr-2");
    			add_location(div3, file$1, 331, 5, 14459);
    			attr_dev(div4, "class", "flex flex-col sm:flex-row flex-wrap ");
    			add_location(div4, file$1, 325, 4, 14022);
    			attr_dev(div5, "class", "w-full flex flex-row justify-start mb-4");
    			add_location(div5, file$1, 324, 3, 13964);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div1);
    			append_dev(div1, div0);
    			append_dev(div1, t1);
    			append_dev(div1, input0);
    			set_input_value(input0, /*inscrit*/ ctx[55].prenom);
    			append_dev(div4, t2);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div3, t4);
    			append_dev(div3, input1);
    			set_input_value(input1, /*inscrit*/ ctx[55].nom);
    			append_dev(div5, t5);
    			if (if_block) if_block.m(div5, null);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(input0, "input", input0_input_handler_1),
    				listen_dev(input1, "input", input1_input_handler)
    			];
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*listeInscrits*/ 4 && input0.value !== /*inscrit*/ ctx[55].prenom) {
    				set_input_value(input0, /*inscrit*/ ctx[55].prenom);
    			}

    			if (dirty[0] & /*listeInscrits*/ 4 && input1.value !== /*inscrit*/ ctx[55].nom) {
    				set_input_value(input1, /*inscrit*/ ctx[55].nom);
    			}

    			if (/*listeInscrits*/ ctx[2].length > 1) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_13(ctx);
    					if_block.c();
    					if_block.m(div5, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			if (if_block) if_block.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(324:3) {#each listeInscrits as inscrit}",
    		ctx
    	});

    	return block;
    }

    // (371:20) {:else}
    function create_else_block_1(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = " ";
    			attr_dev(div, "class", "text-sm font-medium text-rougeLBF ");
    			add_location(div, file$1, 371, 24, 18219);
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
    		source: "(371:20) {:else}",
    		ctx
    	});

    	return block;
    }

    // (369:20) {#if nouvelInscrit.prenom===""}
    function create_if_block_12(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Au moins le prénom est requis.";
    			attr_dev(div, "class", "text-sm font-medium text-rougeLBF ");
    			add_location(div, file$1, 369, 24, 18082);
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
    		source: "(369:20) {#if nouvelInscrit.prenom===\\\"\\\"}",
    		ctx
    	});

    	return block;
    }

    // (348:3) {#each nouveauxInscrits as nouvelInscrit, index ('nI' + index)}
    function create_each_block(key_1, ctx) {
    	let div7;
    	let div6;
    	let div4;
    	let div1;
    	let div0;
    	let t1;
    	let input0;
    	let t2;
    	let div3;
    	let div2;
    	let t4;
    	let input1;
    	let t5;
    	let div5;
    	let svg;
    	let path;
    	let t6;
    	let t7;
    	let dispose;

    	function input0_input_handler_2() {
    		/*input0_input_handler_2*/ ctx[48].call(input0, /*nouvelInscrit*/ ctx[52]);
    	}

    	function input1_input_handler_1() {
    		/*input1_input_handler_1*/ ctx[49].call(input1, /*nouvelInscrit*/ ctx[52]);
    	}

    	function select_block_type_2(ctx, dirty) {
    		if (/*nouvelInscrit*/ ctx[52].prenom === "") return create_if_block_12;
    		return create_else_block_1;
    	}

    	let current_block_type = select_block_type_2(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			div7 = element("div");
    			div6 = element("div");
    			div4 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = "Prénom";
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			div3 = element("div");
    			div2 = element("div");
    			div2.textContent = "Nom";
    			t4 = space();
    			input1 = element("input");
    			t5 = space();
    			div5 = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t6 = space();
    			if_block.c();
    			t7 = space();
    			attr_dev(div0, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div0, file$1, 352, 32, 16141);
    			attr_dev(input0, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "placeholder", "prenom");
    			add_location(input0, file$1, 353, 32, 16245);
    			attr_dev(div1, "class", "flex flex-col");
    			add_location(div1, file$1, 351, 28, 16081);
    			attr_dev(div2, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div2, file$1, 357, 32, 16673);
    			attr_dev(input1, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "placeholder", "nom");
    			add_location(input1, file$1, 358, 32, 16774);
    			attr_dev(div3, "class", "flex flex-col");
    			add_location(div3, file$1, 356, 28, 16613);
    			attr_dev(div4, "class", "flex flex-col sm:flex-row");
    			add_location(div4, file$1, 350, 24, 16013);
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z");
    			add_location(path, file$1, 364, 32, 17465);
    			attr_dev(svg, "class", "mx-auto cursor-pointer mt-3 h-12 w-12 md:h-8 md:w-8 stroke-current text-rougeLBF");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "data-prefix", "far");
    			attr_dev(svg, "data-icon", "trash-alt");
    			attr_dev(svg, "viewBox", "0 0 448 512");
    			add_location(svg, file$1, 363, 28, 17187);
    			attr_dev(div5, "class", "my-auto");
    			add_location(div5, file$1, 362, 24, 17137);
    			attr_dev(div6, "class", "flex flex-row justify-end");
    			add_location(div6, file$1, 349, 20, 15949);
    			attr_dev(div7, "class", "w-full flex flex-col justify-start");
    			add_location(div7, file$1, 348, 4, 15880);
    			this.first = div7;
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, div7, anchor);
    			append_dev(div7, div6);
    			append_dev(div6, div4);
    			append_dev(div4, div1);
    			append_dev(div1, div0);
    			append_dev(div1, t1);
    			append_dev(div1, input0);
    			set_input_value(input0, /*nouvelInscrit*/ ctx[52].prenom);
    			append_dev(div4, t2);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div3, t4);
    			append_dev(div3, input1);
    			set_input_value(input1, /*nouvelInscrit*/ ctx[52].nom);
    			append_dev(div6, t5);
    			append_dev(div6, div5);
    			append_dev(div5, svg);
    			append_dev(svg, path);
    			append_dev(div7, t6);
    			if_block.m(div7, null);
    			append_dev(div7, t7);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(input0, "input", /*validationSave*/ ctx[28], false, false, false),
    				listen_dev(input0, "input", input0_input_handler_2),
    				listen_dev(input1, "input", input1_input_handler_1),
    				listen_dev(
    					svg,
    					"click",
    					function () {
    						if (is_function(/*soustraitInscrit*/ ctx[27](/*index*/ ctx[54]))) /*soustraitInscrit*/ ctx[27](/*index*/ ctx[54]).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				)
    			];
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*nouveauxInscrits*/ 16 && input0.value !== /*nouvelInscrit*/ ctx[52].prenom) {
    				set_input_value(input0, /*nouvelInscrit*/ ctx[52].prenom);
    			}

    			if (dirty[0] & /*nouveauxInscrits*/ 16 && input1.value !== /*nouvelInscrit*/ ctx[52].nom) {
    				set_input_value(input1, /*nouvelInscrit*/ ctx[52].nom);
    			}

    			if (current_block_type !== (current_block_type = select_block_type_2(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div7, t7);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div7);
    			if_block.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(348:3) {#each nouveauxInscrits as nouvelInscrit, index ('nI' + index)}",
    		ctx
    	});

    	return block;
    }

    // (377:12) {#if (nbPlaces-nouveauxInscrits.length) === 0}
    function create_if_block_11(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Cet atelier ne peut accepter plus de participants.";
    			attr_dev(div, "class", "text-sm sm:text-xs md:text-sm font-medium text-rougeLBF ");
    			add_location(div, file$1, 377, 16, 18422);
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
    		source: "(377:12) {#if (nbPlaces-nouveauxInscrits.length) === 0}",
    		ctx
    	});

    	return block;
    }

    // (381:16) {#if (nbPlaces-nouveauxInscrits.length) > 0}
    function create_if_block_10(ctx) {
    	let button;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Ajouter un participant";
    			attr_dev(button, "class", "mt-1 mx-1 px-1 border-2 border-vertLBF rounded text-base font-medium text-vertLBF");
    			add_location(button, file$1, 381, 20, 18666);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, button, anchor);
    			if (remount) dispose();
    			dispose = listen_dev(button, "click", /*ajoutInscrit*/ ctx[26], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_10.name,
    		type: "if",
    		source: "(381:16) {#if (nbPlaces-nouveauxInscrits.length) > 0}",
    		ctx
    	});

    	return block;
    }

    // (386:16) {#if listeInscrits.length > 0}
    function create_if_block_9(ctx) {
    	let button;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Se désinscrire";
    			attr_dev(button, "class", "mt-1 mx-1 px-1 border-2 border-orangeLBF rounded text-base font-medium text-orangeLBF");
    			add_location(button, file$1, 386, 20, 18955);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, button, anchor);
    			if (remount) dispose();
    			dispose = listen_dev(button, "click", /*click_handler*/ ctx[51], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_9.name,
    		type: "if",
    		source: "(386:16) {#if listeInscrits.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (391:16) {#if flagSaveValide}
    function create_if_block_8(ctx) {
    	let button;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Enregistrer";
    			attr_dev(button, "class", "mt-1 mx-1 px-1 border-2 border-bleuLBF rounded text-base font-medium text-bleuLBF");
    			add_location(button, file$1, 391, 16, 19250);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, button, anchor);
    			if (remount) dispose();
    			dispose = listen_dev(button, "click", /*insertInscrits*/ ctx[22], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_8.name,
    		type: "if",
    		source: "(391:16) {#if flagSaveValide}",
    		ctx
    	});

    	return block;
    }

    // (401:0) {#if flagVerifDesinscription}
    function create_if_block_4(ctx) {
    	let mon_modal;
    	let span0;
    	let t1;
    	let span1;
    	let t3;
    	let span2;
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
    			add_location(span0, file$1, 402, 8, 19675);
    			attr_dev(span1, "slot", "boutonBleu");
    			add_location(span1, file$1, 404, 8, 19775);
    			attr_dev(span2, "slot", "boutonDefaut");
    			add_location(span2, file$1, 405, 8, 19824);
    			set_custom_element_data(mon_modal, "has_bouton_bleu", "true");
    			set_custom_element_data(mon_modal, "bouton_bleu_busy", /*busyEffacerInscription*/ ctx[13]);
    			add_location(mon_modal, file$1, 401, 4, 19538);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, span1);
    			append_dev(mon_modal, t3);
    			append_dev(mon_modal, span2);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    				listen_dev(mon_modal, "boutonBleu", /*effacerInscription*/ ctx[23], false, false, false)
    			];
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*busyEffacerInscription*/ 8192) {
    				set_custom_element_data(mon_modal, "bouton_bleu_busy", /*busyEffacerInscription*/ ctx[13]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(401:0) {#if flagVerifDesinscription}",
    		ctx
    	});

    	return block;
    }

    // (409:0) {#if flagVerifEffacer}
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
    			add_location(span0, file$1, 410, 8, 20044);
    			attr_dev(span1, "slot", "boutonBleu");
    			add_location(span1, file$1, 412, 8, 20163);
    			attr_dev(span2, "slot", "boutonDefaut");
    			add_location(span2, file$1, 413, 8, 20212);
    			set_custom_element_data(mon_modal, "has_bouton_bleu", "true");
    			set_custom_element_data(mon_modal, "bouton_bleu_busy", /*busyEffacerInscrit*/ ctx[15]);
    			add_location(mon_modal, file$1, 409, 4, 19915);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, t2);
    			append_dev(mon_modal, t3);
    			append_dev(mon_modal, span1);
    			append_dev(mon_modal, t5);
    			append_dev(mon_modal, span2);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    				listen_dev(mon_modal, "boutonBleu", /*effacerInscrit*/ ctx[24], false, false, false)
    			];
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*desinscrit*/ 32 && t2_value !== (t2_value = /*desinscrit*/ ctx[5].prenom + "")) set_data_dev(t2, t2_value);

    			if (dirty[0] & /*busyEffacerInscrit*/ 32768) {
    				set_custom_element_data(mon_modal, "bouton_bleu_busy", /*busyEffacerInscrit*/ ctx[15]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(409:0) {#if flagVerifEffacer}",
    		ctx
    	});

    	return block;
    }

    // (417:0) {#if confirmeDesinscription}
    function create_if_block_2(ctx) {
    	let mon_modal;
    	let span0;
    	let t1;
    	let span1;
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
    			add_location(span0, file$1, 418, 8, 20377);
    			attr_dev(span1, "slot", "boutonBleu");
    			add_location(span1, file$1, 420, 8, 20490);
    			add_location(mon_modal, file$1, 417, 4, 20309);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, span1);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    				listen_dev(mon_modal, "boutonBleu", /*effacerInscrit*/ ctx[24], false, false, false)
    			];
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(417:0) {#if confirmeDesinscription}",
    		ctx
    	});

    	return block;
    }

    // (424:0) {#if confirmeDesinscrit}
    function create_if_block_1$1(ctx) {
    	let mon_modal;
    	let span0;
    	let t1;
    	let t2_value = /*desinscrit*/ ctx[5].prenom + "";
    	let t2;
    	let t3;
    	let span1;
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
    			add_location(span0, file$1, 425, 8, 20651);
    			attr_dev(span1, "slot", "boutonBleu");
    			add_location(span1, file$1, 427, 8, 20752);
    			add_location(mon_modal, file$1, 424, 4, 20583);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, t2);
    			append_dev(mon_modal, t3);
    			append_dev(mon_modal, span1);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    				listen_dev(mon_modal, "boutonBleu", /*effacerInscrit*/ ctx[24], false, false, false)
    			];
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*desinscrit*/ 32 && t2_value !== (t2_value = /*desinscrit*/ ctx[5].prenom + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(424:0) {#if confirmeDesinscrit}",
    		ctx
    	});

    	return block;
    }

    // (431:0) {#if confirmeInscription}
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
    			add_location(span0, file$1, 432, 8, 20914);
    			add_location(br, file$1, 434, 170, 21164);
    			attr_dev(span1, "class", "text-justify");
    			add_location(span1, file$1, 433, 8, 20966);
    			attr_dev(span2, "slot", "boutonBleu");
    			add_location(span2, file$1, 437, 8, 21458);
    			add_location(mon_modal, file$1, 431, 4, 20846);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, mon_modal, anchor);
    			append_dev(mon_modal, span0);
    			append_dev(mon_modal, t1);
    			append_dev(mon_modal, span1);
    			append_dev(span1, t2);
    			append_dev(span1, br);
    			append_dev(span1, t3);
    			append_dev(mon_modal, t4);
    			append_dev(mon_modal, span2);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(mon_modal, "close", /*close*/ ctx[30], false, false, false),
    				listen_dev(mon_modal, "boutonBleu", /*effacerInscrit*/ ctx[24], false, false, false)
    			];
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(mon_modal);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(431:0) {#if confirmeInscription}",
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
    			add_location(div0, file$1, 242, 2, 8160);
    			attr_dev(div1, "class", "bg-orangeLBF flex flex-row mr-1 text-black text-sm px-1");
    			add_location(div1, file$1, 241, 1, 8088);
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z");
    			add_location(path, file$1, 246, 3, 8474);
    			attr_dev(svg, "class", "fill-current text-black my-auto");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "viewBox", "0 0 640 512");
    			add_location(svg, file$1, 245, 2, 8326);
    			attr_dev(div2, "class", "text-black text-sm my-auto");
    			add_location(div2, file$1, 248, 2, 9025);
    			attr_dev(div3, "class", "bg-orangeLBF flex flex-row content-center rounded-r px-1 cursor-pointer");
    			add_location(div3, file$1, 244, 1, 8214);
    			attr_dev(div4, "class", "flex flex-row content-center");
    			add_location(div4, file$1, 240, 0, 8044);
    			add_location(slot, file$1, 440, 0, 21522);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor, remount) {
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
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(window_1, "keydown", /*handle_keydown*/ ctx[31], false, false, false),
    				listen_dev(div3, "click", /*afficheModal*/ ctx[29], false, false, false)
    			];
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

    		nbInscrits$1();
    	});

    	// appels graphql
    	async function nbInscrits$1() {
    		$$invalidate(3, nbPlaces = await nbInscrits(id_atelier));
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
    	}

    	async function verifInscrits() {
    		console.log("emailInscription", emailInscription);

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
    		$$invalidate(2, listeInscrits = await getInscrits(emailInscription, id_atelier));

    		if (listeInscrits.length > 0) {
    			$$invalidate(4, nouveauxInscrits = []);
    		} else {
    			$$invalidate(4, nouveauxInscrits = [{ nom: "", prenom: "" }]);
    		}

    		$$invalidate(6, actionEncours = false);
    		$$invalidate(7, flagEmailVerifie = true);
    	}

    	async function insertInscrits() {
    		saveInfoEmail();
    		var insertInscriptions = [];
    		var listeInscriptionsEmail = [];

    		nouveauxInscrits.forEach(inscription => {
    			if (!(inscription.prenom === "" && inscription.nom === "")) {
    				insertInscriptions.push({
    					"email": emailInscription,
    					"prenom": inscription.prenom,
    					"nom": inscription.nom,
    					"atelier": id_atelier
    				});

    				listeInscriptionsEmail.push({
    					"prenom": inscription.prenom,
    					"nom": inscription.nom
    				});
    			}
    		});

    		var insertInscrits = await ajoutInscrits(insertInscriptions);
    		var arrayMails = [];
    		arrayMails.push(emailInscription);

    		var infoMail = {
    			subject: "Confirmation de votre inscription",
    			titreAtelier: titre_atelier,
    			date: date_atelier,
    			participants: listeInscriptionsEmail,
    			urlDesinscription: urlMail + "?idInscription=" + id_atelier + "&email=" + emailInscription,
    			altMachine: "Illustration Atelier",
    			urlImageMail: "https://res.cloudinary.com/la-bonne-fabrique/image/upload/ar_1.5,w_auto,c_fill/" + url_illustration
    		};

    		envoiMail(arrayMails, infoMail);
    		nbInscrits$1();
    		close();
    		$$invalidate(17, confirmeInscription = true);
    	}

    	async function effacerInscription$1() {
    		saveInfoEmail();
    		$$invalidate(13, busyEffacerInscription = true);
    		var effacerInscription$1 = await effacerInscription(emailInscription, id_atelier);
    		nbInscrits$1();
    		$$invalidate(13, busyEffacerInscription = false);
    		close();
    		close();
    		$$invalidate(14, confirmeDesinscription = true);
    	}

    	async function effacerInscrit() {
    		saveInfoEmail();
    		$$invalidate(15, busyEffacerInscrit = true);
    		var effacerInscritById$1 = await effacerInscritById(desinscrit.id);
    		nbInscrits$1();
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
    		if (nbPlaces - nouveauxInscrits.length > 0) nouveauxInscrits.push({ nom: "", prenom: "" });
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function soustraitInscrit(index) {
    		nouveauxInscrits.splice(index, 1);
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function validationSave() {
    		var estValide = true;

    		if (nouveauxInscrits.length === 0) {
    			estValide = false;
    		}

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

    	function input0_input_handler_1(inscrit) {
    		inscrit.prenom = this.value;
    		$$invalidate(2, listeInscrits);
    	}

    	function input1_input_handler(inscrit) {
    		inscrit.nom = this.value;
    		$$invalidate(2, listeInscrits);
    	}

    	function input0_input_handler_2(nouvelInscrit) {
    		nouvelInscrit.prenom = this.value;
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function input1_input_handler_1(nouvelInscrit) {
    		nouvelInscrit.nom = this.value;
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(19, modal = $$value);
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
    		modal,
    		emailInscription,
    		gestionInscriptions,
    		envoiMail,
    		nbInscrits: nbInscrits$1,
    		verifInscrits,
    		insertInscrits,
    		effacerInscription: effacerInscription$1,
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
    		effacerInscription$1,
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
    		flagComplet,
    		urlModifInscription,
    		urlMail,
    		testModal,
    		nbInscrits$1,
    		dernierInscrit,
    		saveInfoEmail,
    		input_handler,
    		input0_input_handler,
    		input1_change_handler,
    		input0_input_handler_1,
    		input1_input_handler,
    		input0_input_handler_2,
    		input1_input_handler_1,
    		div1_binding,
    		click_handler
    	];
    }

    class Inscriptions extends SvelteElement {
    	constructor(options) {
    		super();
    		this.shadowRoot.innerHTML = `<style>hr{box-sizing:content-box;height:0;overflow:visible}button,input{font-family:inherit;font-size:100%;line-height:1.15;margin:0}button,input{overflow:visible}button{text-transform:none}[type=button],button{-webkit-appearance:button}[type=button]::-moz-focus-inner,button::-moz-focus-inner{border-style:none;padding:0}[type=button]:-moz-focusring,button:-moz-focusring{outline:1px dotted ButtonText}[type=checkbox]{box-sizing:border-box;padding:0}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}*,:after,:before{box-sizing:inherit}h2,hr{margin:0}button{background:transparent;padding:0}button:focus{outline:1px dotted;outline:5px auto -webkit-focus-ring-color}ul{margin:0;padding:0}ul{list-style:none}*,:after,:before{border:0 solid #e2e8f0}hr{border-top-width:1px}input::-webkit-input-placeholder{color:#a0aec0}input::-moz-placeholder{color:#a0aec0}input:-ms-input-placeholder{color:#a0aec0}input::-ms-input-placeholder{color:#a0aec0}input::placeholder{color:#a0aec0}button{cursor:pointer}h2{font-size:inherit;font-weight:inherit}button,input{padding:0;line-height:inherit;color:inherit}svg{display:block;vertical-align:middle}@media(min-width:640px){}@media(min-width:768px){}@media(min-width:1024px){}@media(min-width:1280px){}@media not print{}@media print and (-ms-high-contrast:active),print and (-ms-high-contrast:none){}.form-checkbox{-webkit-appearance:none;-moz-appearance:none;appearance:none;-webkit-print-color-adjust:exact;color-adjust:exact;display:inline-block;vertical-align:middle;background-origin:border-box;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;flex-shrink:0;height:1em;width:1em;color:#4299e1;background-color:#fff;border-color:#e2e8f0;border-width:1px;border-radius:.25rem}.form-checkbox:checked{background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 16 16' fill='%23fff' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L7 8.586 5.707 7.293z'/%3E%3C/svg%3E");border-color:transparent;background-color:currentColor;background-size:100% 100%;background-position:50%;background-repeat:no-repeat}@media not print{.form-checkbox::-ms-check{border-width:1px;color:transparent;background:inherit;border-color:inherit;border-radius:inherit}}.form-checkbox:focus{outline:none;box-shadow:0 0 0 3px rgba(66,153,225,.5);border-color:#63b3ed}@media not print{}.appearance-none{-webkit-appearance:none;-moz-appearance:none;appearance:none}.bg-black{background-color:#000}.bg-white{background-color:#fff}.bg-orangeLBF{background-color:#ee732e}.focus\\:bg-white:focus{background-color:#fff}.border-orangeLBF{border-color:#ee732e}.border-bleuLBF{border-color:#4bbcc4}.border-vertLBF{border-color:#93c021}.border-lbfbleu-400{border-color:#4bbcc4}.border-lbfvert-400{border-color:#a4c94a}.focus\\:border-lbfbleu-600:focus{border-color:#3ea1aa}.focus\\:border-lbfvert-600:focus{border-color:#6d9d0b}.rounded{border-radius:.25rem}.rounded-lg{border-radius:.5rem}.rounded-r{border-top-right-radius:.25rem}.rounded-r{border-bottom-right-radius:.25rem}.border-2{border-width:2px}.border-b-2{border-bottom-width:2px}.cursor-pointer{cursor:pointer}.block{display:block}.flex{display:-webkit-box;display:flex}.flex-row{-webkit-box-orient:horizontal;flex-direction:row}.flex-col,.flex-row{-webkit-box-direction:normal}.flex-col{-webkit-box-orient:vertical;flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-start{-webkit-box-align:start;align-items:flex-start}.items-center{-webkit-box-align:center;align-items:center}.self-end{align-self:flex-end}.justify-start{-webkit-box-pack:start;justify-content:flex-start}.justify-end{-webkit-box-pack:end;justify-content:flex-end}.justify-center{-webkit-box-pack:center;justify-content:center}.content-center{align-content:center}.content-end{align-content:flex-end}.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.h-10{height:2.5rem}.h-12{height:3rem}.h-full{height:100%}.leading-normal{line-height:1.5}.list-disc{list-style-type:disc}.m-0{margin:0}.my-1{margin-top:.25rem;margin-bottom:.25rem}.mx-1{margin-left:.25rem;margin-right:.25rem}.mx-2{margin-left:.5rem;margin-right:.5rem}.mx-8{margin-left:2rem;margin-right:2rem}.my-auto{margin-top:auto;margin-bottom:auto}.mx-auto{margin-left:auto;margin-right:auto}.mt-1{margin-top:.25rem}.mr-1{margin-right:.25rem}.mb-1{margin-bottom:.25rem}.ml-1{margin-left:.25rem}.mt-2{margin-top:.5rem}.mr-2{margin-right:.5rem}.mt-3{margin-top:.75rem}.mb-4{margin-bottom:1rem}.ml-4{margin-left:1rem}.ml-6{margin-left:1.5rem}.max-h-5\\/6{max-height:83%}.opacity-75{opacity:.75}.focus\\:outline-none:focus{outline:0}.overflow-auto{overflow:auto}.p-0{padding:0}.p-4{padding:1rem}.px-1{padding-left:.25rem;padding-right:.25rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-4{padding-left:1rem;padding-right:1rem}.pb-1{padding-bottom:.25rem}.pr-8{padding-right:2rem}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.top-0{top:0}.left-0{left:0}.fill-current{fill:currentColor}.stroke-current{stroke:currentColor}.text-justify{text-align:justify}.text-black{color:#000}.text-orangeLBF{color:#ee732e}.text-bleuLBF{color:#4bbcc4}.text-vertLBF{color:#93c021}.text-rougeLBF{color:#e02933}.text-lbfbleu-600{color:#3ea1aa}.text-lbfvert-500{color:#93c021}.text-lbfvert-600{color:#6d9d0b}.text-xs{font-size:.75rem}.text-sm{font-size:.875rem}.text-base{font-size:1rem}.text-lg{font-size:1.125rem}.text-xl{font-size:1.25rem}.w-12{width:3rem}.w-20{width:5rem}.w-5\\/6{width:83.333333%}.w-full{width:100%}.z-100{z-index:100}@media(min-width:640px){.sm\\:flex-row{-webkit-box-orient:horizontal;flex-direction:row}.sm\\:flex-row{-webkit-box-direction:normal}.sm\\:h-8{height:2rem}.sm\\:mr-2{margin-right:.5rem}.sm\\:max-w-620px{max-width:620px}.sm\\:text-xs{font-size:.75rem}.sm\\:w-8{width:2rem}.sm\\:w-12{width:3rem}.sm\\:w-20{width:5rem}}@media(min-width:768px){.md\\:flex-no-wrap{flex-wrap:nowrap}.md\\:h-8{height:2rem}.md\\:text-sm{font-size:.875rem}.md\\:w-8{width:2rem}}@media(min-width:1024px){}</style>`;

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
