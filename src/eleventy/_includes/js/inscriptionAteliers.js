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
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
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
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
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
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.17.2' }, detail)));
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

    /* src/svelte/inscriptions/inscriptions.svelte generated by Svelte v3.17.2 */

    const { console: console_1 } = globals;

    const file = "src/svelte/inscriptions/inscriptions.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[24] = list[i];
    	child_ctx[25] = list;
    	child_ctx[26] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[27] = list[i];
    	child_ctx[28] = list;
    	child_ctx[29] = i;
    	return child_ctx;
    }

    // (113:0) {#if showModalInscription}
    function create_if_block_1(ctx) {
    	let div5;
    	let div0;
    	let t0;
    	let div4;
    	let h2;
    	let t2;
    	let hr;
    	let t3;
    	let div1;
    	let t5;
    	let div2;
    	let t7;
    	let div3;
    	let input;
    	let t8;
    	let t9;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*flagEmailVeriEnCours*/ ctx[5]) return create_if_block_5;
    		if (!/*flagEmailVerifie*/ ctx[6]) return create_if_block_6;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type && current_block_type(ctx);
    	let if_block1 = /*flagEmailVerifie*/ ctx[6] && create_if_block_2(ctx);

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div4 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Votre inscription";
    			t2 = space();
    			hr = element("hr");
    			t3 = space();
    			div1 = element("div");
    			div1.textContent = "Merci de renseigner votre adresse mail et de cliquer sur vérifier.";
    			t5 = space();
    			div2 = element("div");
    			div2.textContent = "Si vous vous êtes déjà inscrit à cet atelier, la liste de vos inscriptions s'affichera une fois la vérification faite, sinon vous serez invité à entrer le détail de l'inscription. Vous pouvez à tous moment revenir sur cette page pour modifier vos inscriptions.";
    			t7 = space();
    			div3 = element("div");
    			input = element("input");
    			t8 = space();
    			if (if_block0) if_block0.c();
    			t9 = space();
    			if (if_block1) if_block1.c();
    			attr_dev(div0, "class", "absolute w-full h-full  bg-black opacity-75 top-0 left-0 cursor-pointer");
    			add_location(div0, file, 114, 1, 3951);
    			attr_dev(h2, "class", "text-xl w-full mx-2 pb-1 mb-1 border-b-2 border-vertLBF font-bold");
    			add_location(h2, file, 117, 2, 4215);
    			attr_dev(hr, "class", "mb-1");
    			add_location(hr, file, 120, 2, 4325);
    			attr_dev(div1, "class", "mb-1 text-base font-medium text-justify");
    			add_location(div1, file, 121, 2, 4347);
    			attr_dev(div2, "class", "text-base text-justify");
    			add_location(div2, file, 124, 2, 4482);
    			input.autofocus = true;
    			attr_dev(input, "class", "w-full sm:w-4/5 mt-2 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfvert-600 border-2 border-lbfvert-400 rounded-lg px-4 block appearance-none leading-normal");
    			attr_dev(input, "type", "email");
    			attr_dev(input, "placeholder", "adresse email");
    			add_location(input, file, 128, 3, 4863);
    			attr_dev(div3, "class", "flex content-center flex-wrap w-full justify-around");
    			add_location(div3, file, 127, 2, 4794);
    			attr_dev(div4, "class", "relative overflow-auto max-h-5/6 w-5/6 sm:w-3/4 lg:w-1/2 bg-white flex flex-col p-2 items-start rounded");
    			attr_dev(div4, "role", "dialog");
    			attr_dev(div4, "aria-modal", "true");
    			add_location(div4, file, 116, 1, 4063);
    			attr_dev(div5, "class", "z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center");
    			add_location(div5, file, 113, 0, 3864);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div0);
    			append_dev(div5, t0);
    			append_dev(div5, div4);
    			append_dev(div4, h2);
    			append_dev(div4, t2);
    			append_dev(div4, hr);
    			append_dev(div4, t3);
    			append_dev(div4, div1);
    			append_dev(div4, t5);
    			append_dev(div4, div2);
    			append_dev(div4, t7);
    			append_dev(div4, div3);
    			append_dev(div3, input);
    			set_input_value(input, /*emailInscription*/ ctx[2]);
    			append_dev(div3, t8);
    			if (if_block0) if_block0.m(div3, null);
    			append_dev(div4, t9);
    			if (if_block1) if_block1.m(div4, null);
    			input.focus();

    			dispose = [
    				listen_dev(div0, "click", /*close*/ ctx[16], false, false, false),
    				listen_dev(
    					input,
    					"input",
    					function () {
    						if (is_function(/*flagEmailVerifie*/ ctx[6] = false)) (/*flagEmailVerifie*/ ctx[6] = false).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				),
    				listen_dev(input, "input", /*input_input_handler*/ ctx[19])
    			];
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*emailInscription*/ 4 && input.value !== /*emailInscription*/ ctx[2]) {
    				set_input_value(input, /*emailInscription*/ ctx[2]);
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if (if_block0) if_block0.d(1);
    				if_block0 = current_block_type && current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div3, null);
    				}
    			}

    			if (/*flagEmailVerifie*/ ctx[6]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(div4, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);

    			if (if_block0) {
    				if_block0.d();
    			}

    			if (if_block1) if_block1.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(113:0) {#if showModalInscription}",
    		ctx
    	});

    	return block;
    }

    // (144:31) 
    function create_if_block_6(ctx) {
    	let button;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Envoyer";
    			attr_dev(button, "class", "w-full sm:w-20 mt-2 mx-1 px-2 h-10 border-2 border-vertLBF rounded text-vertLBF font-semibold");
    			attr_dev(button, "type", "button");
    			add_location(button, file, 144, 3, 6235);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			dispose = listen_dev(button, "click", /*verifInscrits*/ ctx[8], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6.name,
    		type: "if",
    		source: "(144:31) ",
    		ctx
    	});

    	return block;
    }

    // (131:3) {#if flagEmailVeriEnCours}
    function create_if_block_5(ctx) {
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
    			add_location(animate0, file, 134, 6, 5433);
    			attr_dev(animate1, "attributeName", "stroke-opacity");
    			attr_dev(animate1, "begin", "0s");
    			attr_dev(animate1, "dur", "1.8s");
    			attr_dev(animate1, "values", "1; 0");
    			attr_dev(animate1, "calcMode", "spline");
    			attr_dev(animate1, "keyTimes", "0; 1");
    			attr_dev(animate1, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate1, "repeatCount", "indefinite");
    			add_location(animate1, file, 135, 6, 5598);
    			attr_dev(circle0, "cx", "22");
    			attr_dev(circle0, "cy", "22");
    			attr_dev(circle0, "r", "1");
    			add_location(circle0, file, 133, 5, 5396);
    			attr_dev(animate2, "attributeName", "r");
    			attr_dev(animate2, "begin", "-0.9s");
    			attr_dev(animate2, "dur", "1.8s");
    			attr_dev(animate2, "values", "1; 20");
    			attr_dev(animate2, "calcMode", "spline");
    			attr_dev(animate2, "keyTimes", "0; 1");
    			attr_dev(animate2, "keySplines", "0.165, 0.84, 0.44, 1");
    			attr_dev(animate2, "repeatCount", "indefinite");
    			add_location(animate2, file, 138, 6, 5825);
    			attr_dev(animate3, "attributeName", "stroke-opacity");
    			attr_dev(animate3, "begin", "-0.9s");
    			attr_dev(animate3, "dur", "1.8s");
    			attr_dev(animate3, "values", "1; 0");
    			attr_dev(animate3, "calcMode", "spline");
    			attr_dev(animate3, "keyTimes", "0; 1");
    			attr_dev(animate3, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate3, "repeatCount", "indefinite");
    			add_location(animate3, file, 139, 6, 5993);
    			attr_dev(circle1, "cx", "22");
    			attr_dev(circle1, "cy", "22");
    			attr_dev(circle1, "r", "1");
    			add_location(circle1, file, 137, 5, 5788);
    			attr_dev(g, "fill", "none");
    			attr_dev(g, "fill-rule", "evenodd");
    			attr_dev(g, "stroke-width", "2");
    			add_location(g, file, 132, 4, 5338);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "class", "stroke-current text-lbfvert-500 h-12 w-12 mx-auto mt-2");
    			attr_dev(svg, "viewBox", "0 0 50 50");
    			add_location(svg, file, 131, 3, 5210);
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
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(131:3) {#if flagEmailVeriEnCours}",
    		ctx
    	});

    	return block;
    }

    // (150:2) {#if flagEmailVerifie}
    function create_if_block_2(ctx) {
    	let div;
    	let t1;
    	let t2;
    	let each_blocks = [];
    	let each1_lookup = new Map();
    	let t3;
    	let button0;
    	let t5;
    	let button1;
    	let dispose;
    	let each_value_1 = /*listeInscrits*/ ctx[3];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*nouveauxInscrits*/ ctx[4];
    	const get_key = ctx => "nI" + /*index*/ ctx[26];

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Liste des inscriptions";
    			t1 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t2 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t3 = space();
    			button0 = element("button");
    			button0.textContent = "Sauver";
    			t5 = space();
    			button1 = element("button");
    			button1.textContent = "Désinscription";
    			attr_dev(div, "class", "text-lg font-bold mt-2 text-bleuLBF");
    			add_location(div, file, 150, 2, 6455);
    			add_location(button0, file, 203, 3, 10944);
    			add_location(button1, file, 206, 3, 11006);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			insert_dev(target, t1, anchor);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(target, anchor);
    			}

    			insert_dev(target, t2, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, t3, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t5, anchor);
    			insert_dev(target, button1, anchor);

    			dispose = [
    				listen_dev(button0, "click", /*insertInscrits*/ ctx[9], false, false, false),
    				listen_dev(button1, "click", /*effacerInscription*/ ctx[10], false, false, false)
    			];
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*effaceInscrit, listeInscrits*/ 2056) {
    				each_value_1 = /*listeInscrits*/ ctx[3];
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

    			const each_value = /*nouveauxInscrits*/ ctx[4];
    			each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each1_lookup, t3.parentNode, destroy_block, create_each_block, t3, get_each_context);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching) detach_dev(t1);
    			destroy_each(each_blocks_1, detaching);
    			if (detaching) detach_dev(t2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t5);
    			if (detaching) detach_dev(button1);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(150:2) {#if flagEmailVerifie}",
    		ctx
    	});

    	return block;
    }

    // (152:3) {#each listeInscrits as inscrit}
    function create_each_block_1(ctx) {
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
    	let dispose;

    	function input0_input_handler() {
    		/*input0_input_handler*/ ctx[20].call(input0, /*inscrit*/ ctx[27]);
    	}

    	function input1_input_handler() {
    		/*input1_input_handler*/ ctx[21].call(input1, /*inscrit*/ ctx[27]);
    	}

    	const block = {
    		c: function create() {
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
    			attr_dev(div0, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div0, file, 155, 6, 6728);
    			attr_dev(input0, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "placeholder", "prenom");
    			add_location(input0, file, 156, 6, 6806);
    			attr_dev(div1, "class", "flex flex-col sm:mr-2");
    			add_location(div1, file, 154, 5, 6686);
    			attr_dev(div2, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div2, file, 160, 6, 7109);
    			attr_dev(input1, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "placeholder", "prenom");
    			add_location(input1, file, 161, 6, 7184);
    			attr_dev(div3, "class", "flex flex-col sm:mr-2");
    			add_location(div3, file, 159, 5, 7067);
    			attr_dev(div4, "class", "flex flex-col sm:flex-row flex-wrap ");
    			add_location(div4, file, 153, 4, 6630);
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M268 416h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12zM432 80h-82.41l-34-56.7A48 48 0 00274.41 0H173.59a48 48 0 00-41.16 23.3L98.41 80H16A16 16 0 000 96v16a16 16 0 0016 16h16v336a48 48 0 0048 48h288a48 48 0 0048-48V128h16a16 16 0 0016-16V96a16 16 0 00-16-16zM171.84 50.91A6 6 0 01177 48h94a6 6 0 015.15 2.91L293.61 80H154.39zM368 464H80V128h288zm-212-48h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12z");
    			add_location(path, file, 167, 6, 7750);
    			attr_dev(svg, "class", "mx-auto cursor-pointer mt-3 h-12 w-12 sm:h-8 sm:w-8 stroke-current text-lbfbleu-600");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "data-prefix", "far");
    			attr_dev(svg, "data-icon", "trash-alt");
    			attr_dev(svg, "viewBox", "0 0 448 512");
    			add_location(svg, file, 166, 5, 7493);
    			attr_dev(div5, "class", "my-auto sm:w-12 w-20 ");
    			add_location(div5, file, 165, 4, 7452);
    			attr_dev(div6, "class", "w-full flex flex-row justify-start mb-4");
    			add_location(div6, file, 152, 3, 6572);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div6, anchor);
    			append_dev(div6, div4);
    			append_dev(div4, div1);
    			append_dev(div1, div0);
    			append_dev(div1, t1);
    			append_dev(div1, input0);
    			set_input_value(input0, /*inscrit*/ ctx[27].prenom);
    			append_dev(div4, t2);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div3, t4);
    			append_dev(div3, input1);
    			set_input_value(input1, /*inscrit*/ ctx[27].nom);
    			append_dev(div6, t5);
    			append_dev(div6, div5);
    			append_dev(div5, svg);
    			append_dev(svg, path);

    			dispose = [
    				listen_dev(input0, "input", input0_input_handler),
    				listen_dev(input1, "input", input1_input_handler),
    				listen_dev(
    					svg,
    					"click",
    					function () {
    						if (is_function(/*effaceInscrit*/ ctx[11](/*inscrit*/ ctx[27].id))) /*effaceInscrit*/ ctx[11](/*inscrit*/ ctx[27].id).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				)
    			];
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*listeInscrits*/ 8 && input0.value !== /*inscrit*/ ctx[27].prenom) {
    				set_input_value(input0, /*inscrit*/ ctx[27].prenom);
    			}

    			if (dirty & /*listeInscrits*/ 8 && input1.value !== /*inscrit*/ ctx[27].nom) {
    				set_input_value(input1, /*inscrit*/ ctx[27].nom);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div6);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(152:3) {#each listeInscrits as inscrit}",
    		ctx
    	});

    	return block;
    }

    // (199:5) {:else}
    function create_else_block(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Un prénom est requis.";
    			attr_dev(div, "class", "text-sm sm:text-xs md:text-sm font-medium text-rougeLBF sm:w-12 md:w-20 w-20 mt-4");
    			add_location(div, file, 199, 6, 10785);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(199:5) {:else}",
    		ctx
    	});

    	return block;
    }

    // (193:38) 
    function create_if_block_4(ctx) {
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
    			attr_dev(path, "d", "M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z");
    			add_location(path, file, 195, 7, 10293);
    			attr_dev(svg, "class", "mx-auto cursor-pointer mt-3 h-12 w-12 sm:h-8 sm:w-8 stroke-current text-rougeLBF");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "data-prefix", "far");
    			attr_dev(svg, "data-icon", "trash-alt");
    			attr_dev(svg, "viewBox", "0 0 448 512");
    			add_location(svg, file, 194, 6, 10040);
    			attr_dev(div, "class", "my-auto sm:w-12 w-20 ");
    			add_location(div, file, 193, 5, 9998);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, path);

    			dispose = listen_dev(
    				svg,
    				"click",
    				function () {
    					if (is_function(/*soustraitInscrit*/ ctx[14](/*index*/ ctx[26]))) /*soustraitInscrit*/ ctx[14](/*index*/ ctx[26]).apply(this, arguments);
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
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(193:38) ",
    		ctx
    	});

    	return block;
    }

    // (187:5) {#if dernierInscrit(index) && nouvelInscrit.prenom !== ""}
    function create_if_block_3(ctx) {
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
    			attr_dev(path, "d", "M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z");
    			add_location(path, file, 189, 7, 9622);
    			attr_dev(svg, "class", "mx-auto cursor-pointer mt-3 h-12 w-12 sm:h-8 sm:w-8 stroke-current text-lbfbleu-600");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "data-prefix", "far");
    			attr_dev(svg, "data-icon", "trash-alt");
    			attr_dev(svg, "viewBox", "0 0 448 512");
    			add_location(svg, file, 188, 6, 9377);
    			attr_dev(div, "class", "my-auto sm:w-12 w-20 ");
    			add_location(div, file, 187, 5, 9335);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, path);
    			dispose = listen_dev(svg, "click", /*ajoutInscrit*/ ctx[13], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(187:5) {#if dernierInscrit(index) && nouvelInscrit.prenom !== \\\"\\\"}",
    		ctx
    	});

    	return block;
    }

    // (173:3) {#each nouveauxInscrits as nouvelInscrit, index ('nI' + index)}
    function create_each_block(key_1, ctx) {
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
    	let show_if;
    	let show_if_1;
    	let dispose;

    	function input0_input_handler_1() {
    		/*input0_input_handler_1*/ ctx[22].call(input0, /*nouvelInscrit*/ ctx[24]);
    	}

    	function input1_input_handler_1() {
    		/*input1_input_handler_1*/ ctx[23].call(input1, /*nouvelInscrit*/ ctx[24]);
    	}

    	function select_block_type_1(ctx, dirty) {
    		if (show_if == null || dirty & /*nouveauxInscrits*/ 16) show_if = !!(/*dernierInscrit*/ ctx[12](/*index*/ ctx[26]) && /*nouvelInscrit*/ ctx[24].prenom !== "");
    		if (show_if) return create_if_block_3;
    		if (show_if_1 == null || dirty & /*nouveauxInscrits*/ 16) show_if_1 = !!!/*dernierInscrit*/ ctx[12](/*index*/ ctx[26]);
    		if (show_if_1) return create_if_block_4;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type_1(ctx, -1);
    	let if_block = current_block_type(ctx);

    	const block = {
    		key: key_1,
    		first: null,
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
    			if_block.c();
    			attr_dev(div0, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div0, file, 176, 7, 8528);
    			attr_dev(input0, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "placeholder", "prenom");
    			add_location(input0, file, 177, 7, 8607);
    			attr_dev(div1, "class", "flex flex-col sm:mr-2");
    			add_location(div1, file, 175, 6, 8485);
    			attr_dev(div2, "class", "ml-1 text-xs m-0 p-0 font-medium text-bleuLBF");
    			add_location(div2, file, 181, 7, 8920);
    			attr_dev(input1, "class", "mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "placeholder", "nom");
    			add_location(input1, file, 182, 7, 8996);
    			attr_dev(div3, "class", "flex flex-col sm:mr-2");
    			add_location(div3, file, 180, 6, 8877);
    			attr_dev(div4, "class", "flex flex-col sm:flex-row flex-wrap ");
    			add_location(div4, file, 174, 5, 8428);
    			attr_dev(div5, "class", "w-full flex flex-row justify-start mb-4");
    			add_location(div5, file, 173, 4, 8369);
    			this.first = div5;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div1);
    			append_dev(div1, div0);
    			append_dev(div1, t1);
    			append_dev(div1, input0);
    			set_input_value(input0, /*nouvelInscrit*/ ctx[24].prenom);
    			append_dev(div4, t2);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div3, t4);
    			append_dev(div3, input1);
    			set_input_value(input1, /*nouvelInscrit*/ ctx[24].nom);
    			append_dev(div5, t5);
    			if_block.m(div5, null);

    			dispose = [
    				listen_dev(input0, "input", input0_input_handler_1),
    				listen_dev(input1, "input", input1_input_handler_1)
    			];
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*nouveauxInscrits*/ 16 && input0.value !== /*nouvelInscrit*/ ctx[24].prenom) {
    				set_input_value(input0, /*nouvelInscrit*/ ctx[24].prenom);
    			}

    			if (dirty & /*nouveauxInscrits*/ 16 && input1.value !== /*nouvelInscrit*/ ctx[24].nom) {
    				set_input_value(input1, /*nouvelInscrit*/ ctx[24].nom);
    			}

    			if (current_block_type === (current_block_type = select_block_type_1(ctx, dirty)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div5, null);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			if_block.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(173:3) {#each nouveauxInscrits as nouvelInscrit, index ('nI' + index)}",
    		ctx
    	});

    	return block;
    }

    // (214:0) {#if flagVerifEffacer}
    function create_if_block(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let div1;
    	let dispose;

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			div1.textContent = "bob";
    			attr_dev(div0, "class", "absolute w-full h-full  bg-black opacity-75 top-0 left-0 cursor-pointer");
    			add_location(div0, file, 215, 2, 11218);
    			attr_dev(div1, "class", "relative overflow-auto max-h-5/6 w-5/6 sm:w-3/4 lg:w-1/2 bg-white flex flex-col p-2 items-start rounded");
    			attr_dev(div1, "role", "dialog");
    			attr_dev(div1, "aria-modal", "true");
    			add_location(div1, file, 217, 2, 11332);
    			attr_dev(div2, "class", "z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center");
    			add_location(div2, file, 214, 1, 11130);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			dispose = listen_dev(div0, "click", /*close*/ ctx[16], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(214:0) {#if flagVerifEffacer}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
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
    	let slot;
    	let dispose;
    	let if_block0 = /*showModalInscription*/ ctx[1] && create_if_block_1(ctx);
    	let if_block1 = /*flagVerifEffacer*/ ctx[7] && create_if_block(ctx);

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
    			slot = element("slot");
    			this.c = noop;
    			attr_dev(div0, "class", "my-auto");
    			add_location(div0, file, 102, 2, 2871);
    			attr_dev(div1, "class", "bg-orangeLBF flex flex-row mr-1 text-white text-sm px-1");
    			add_location(div1, file, 101, 1, 2799);
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z");
    			add_location(path, file, 106, 3, 3185);
    			attr_dev(svg, "class", "fill-current text-white my-auto");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "viewBox", "0 0 640 512");
    			add_location(svg, file, 105, 2, 3037);
    			attr_dev(div2, "class", "text-white text-sm my-auto");
    			add_location(div2, file, 108, 2, 3736);
    			attr_dev(div3, "class", "bg-orangeLBF flex flex-row content-center rounded-r px-1 cursor-pointer");
    			add_location(div3, file, 104, 1, 2925);
    			attr_dev(div4, "class", "flex flex-row content-center");
    			add_location(div4, file, 100, 0, 2755);
    			add_location(slot, file, 222, 0, 11512);
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
    			insert_dev(target, slot, anchor);

    			dispose = [
    				listen_dev(window, "keydown", /*handle_keydown*/ ctx[17], false, false, false),
    				listen_dev(div3, "click", /*afficheModal*/ ctx[15], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*placesRestantes*/ 1) set_data_dev(t0, /*placesRestantes*/ ctx[0]);

    			if (/*showModalInscription*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					if_block0.m(t5.parentNode, t5);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*flagVerifEffacer*/ ctx[7]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block(ctx);
    					if_block1.c();
    					if_block1.m(t6.parentNode, t6);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
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
    			if (detaching) detach_dev(slot);
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
    	let { id_atelier = "nope" } = $$props;

    	/* variables */
    	var placesRestantes = "Calculs en cours...";

    	let showModalInscription = false;
    	var emailInscription = "bob@bobby.fr";
    	var listeInscrits = [];
    	var nouveauxInscrits = [{ nom: "", prenom: "" }];
    	var flagEmailVeriEnCours = false;
    	var flagEmailVerifie = false;
    	var flagVerifEffacer = false;

    	//récupération nb inscrits au montage
    	onMount(async () => {
    		await tick();
    		const nbPlaces = await nbInscrits(id_atelier);

    		if (nbPlaces === 0) {
    			$$invalidate(0, placesRestantes = "Complet");
    		} else if (nbPlaces === 1) {
    			$$invalidate(0, placesRestantes = "Dernière place");
    		} else {
    			$$invalidate(0, placesRestantes = nbPlaces + " places restantes");
    		}
    	});

    	// appel graphql
    	async function verifInscrits() {
    		$$invalidate(5, flagEmailVeriEnCours = true);
    		$$invalidate(3, listeInscrits = await getInscrits(emailInscription, id_atelier));
    		$$invalidate(5, flagEmailVeriEnCours = false);
    		$$invalidate(6, flagEmailVerifie = true);
    	}

    	async function insertInscrits() {
    		var insertInscriptions = [];

    		nouveauxInscrits.forEach(inscription => {
    			insertInscriptions.push({
    				"email": emailInscription,
    				"prenom": inscription.prenom,
    				"nom": inscription.nom,
    				"atelier": id_atelier
    			});
    		});

    		console.log("data a insert", insertInscriptions);
    		var insertInscrits = await ajoutInscrits(insertInscriptions);
    	}

    	async function effacerInscription$1() {
    		var effacerInscrits = await effacerInscription(emailInscription, id_atelier);
    	}

    	function effaceInscrit(id) {
    		console.log("efface ", id);
    		$$invalidate(7, flagVerifEffacer = true);
    	}

    	function dernierInscrit(index) {
    		return index + 1 === nouveauxInscrits.length;
    	}

    	function ajoutInscrit() {
    		nouveauxInscrits.push({ nom: "", prenom: "" });
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function soustraitInscrit(index) {
    		nouveauxInscrits.splice(index, 1);
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function afficheModal() {
    		$$invalidate(1, showModalInscription = true);
    	}

    	function close() {
    		if (flagVerifEffacer) {
    			$$invalidate(7, flagVerifEffacer = false);
    		} else {
    			$$invalidate(1, showModalInscription = false);
    		}
    	}

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

    	const writable_props = ["id_atelier"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<une-inscription> was created with unknown prop '${key}'`);
    	});

    	function input_input_handler() {
    		emailInscription = this.value;
    		$$invalidate(2, emailInscription);
    	}

    	function input0_input_handler(inscrit) {
    		inscrit.prenom = this.value;
    		$$invalidate(3, listeInscrits);
    	}

    	function input1_input_handler(inscrit) {
    		inscrit.nom = this.value;
    		$$invalidate(3, listeInscrits);
    	}

    	function input0_input_handler_1(nouvelInscrit) {
    		nouvelInscrit.prenom = this.value;
    		$$invalidate(4, nouveauxInscrits);
    	}

    	function input1_input_handler_1(nouvelInscrit) {
    		nouvelInscrit.nom = this.value;
    		$$invalidate(4, nouveauxInscrits);
    	}

    	$$self.$set = $$props => {
    		if ("id_atelier" in $$props) $$invalidate(18, id_atelier = $$props.id_atelier);
    	};

    	$$self.$capture_state = () => {
    		return {
    			id_atelier,
    			placesRestantes,
    			showModalInscription,
    			emailInscription,
    			listeInscrits,
    			nouveauxInscrits,
    			flagEmailVeriEnCours,
    			flagEmailVerifie,
    			flagVerifEffacer
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("id_atelier" in $$props) $$invalidate(18, id_atelier = $$props.id_atelier);
    		if ("placesRestantes" in $$props) $$invalidate(0, placesRestantes = $$props.placesRestantes);
    		if ("showModalInscription" in $$props) $$invalidate(1, showModalInscription = $$props.showModalInscription);
    		if ("emailInscription" in $$props) $$invalidate(2, emailInscription = $$props.emailInscription);
    		if ("listeInscrits" in $$props) $$invalidate(3, listeInscrits = $$props.listeInscrits);
    		if ("nouveauxInscrits" in $$props) $$invalidate(4, nouveauxInscrits = $$props.nouveauxInscrits);
    		if ("flagEmailVeriEnCours" in $$props) $$invalidate(5, flagEmailVeriEnCours = $$props.flagEmailVeriEnCours);
    		if ("flagEmailVerifie" in $$props) $$invalidate(6, flagEmailVerifie = $$props.flagEmailVerifie);
    		if ("flagVerifEffacer" in $$props) $$invalidate(7, flagVerifEffacer = $$props.flagVerifEffacer);
    	};

    	return [
    		placesRestantes,
    		showModalInscription,
    		emailInscription,
    		listeInscrits,
    		nouveauxInscrits,
    		flagEmailVeriEnCours,
    		flagEmailVerifie,
    		flagVerifEffacer,
    		verifInscrits,
    		insertInscrits,
    		effacerInscription$1,
    		effaceInscrit,
    		dernierInscrit,
    		ajoutInscrit,
    		soustraitInscrit,
    		afficheModal,
    		close,
    		handle_keydown,
    		id_atelier,
    		input_input_handler,
    		input0_input_handler,
    		input1_input_handler,
    		input0_input_handler_1,
    		input1_input_handler_1
    	];
    }

    class Inscriptions extends SvelteElement {
    	constructor(options) {
    		super();
    		this.shadowRoot.innerHTML = `<style>hr{box-sizing:content-box;height:0;overflow:visible}button,input{font-family:inherit;font-size:100%;line-height:1.15;margin:0}button,input{overflow:visible}button{text-transform:none}[type=button],button{-webkit-appearance:button}[type=button]::-moz-focus-inner,button::-moz-focus-inner{border-style:none;padding:0}[type=button]:-moz-focusring,button:-moz-focusring{outline:1px dotted ButtonText}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}*,:after,:before{box-sizing:inherit}h2,hr{margin:0}button{background:transparent;padding:0}button:focus{outline:1px dotted;outline:5px auto -webkit-focus-ring-color}*,:after,:before{border:0 solid #e2e8f0}hr{border-top-width:1px}input::-webkit-input-placeholder{color:#a0aec0}input::-moz-placeholder{color:#a0aec0}input:-ms-input-placeholder{color:#a0aec0}input::-ms-input-placeholder{color:#a0aec0}input::placeholder{color:#a0aec0}button{cursor:pointer}h2{font-size:inherit;font-weight:inherit}button,input{padding:0;line-height:inherit;color:inherit}svg{display:block;vertical-align:middle}@media(min-width:640px){}@media(min-width:768px){}@media(min-width:1024px){}@media(min-width:1280px){}@media not print{}@media print and (-ms-high-contrast:active),print and (-ms-high-contrast:none){}@media not print{}@media not print{}.appearance-none{-webkit-appearance:none;-moz-appearance:none;appearance:none}.bg-black{background-color:#000}.bg-white{background-color:#fff}.bg-orangeLBF{background-color:#ee732e}.focus\\:bg-white:focus{background-color:#fff}.border-vertLBF{border-color:#93c021}.border-lbfbleu-400{border-color:#4bbcc4}.border-lbfvert-400{border-color:#a4c94a}.focus\\:border-lbfbleu-600:focus{border-color:#3ea1aa}.focus\\:border-lbfvert-600:focus{border-color:#6d9d0b}.rounded{border-radius:.25rem}.rounded-lg{border-radius:.5rem}.rounded-r{border-top-right-radius:.25rem}.rounded-r{border-bottom-right-radius:.25rem}.border-2{border-width:2px}.border-b-2{border-bottom-width:2px}.cursor-pointer{cursor:pointer}.block{display:block}.flex{display:-webkit-box;display:flex}.flex-row{-webkit-box-orient:horizontal;flex-direction:row}.flex-col,.flex-row{-webkit-box-direction:normal}.flex-col{-webkit-box-orient:vertical;flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-start{-webkit-box-align:start;align-items:flex-start}.items-center{-webkit-box-align:center;align-items:center}.justify-start{-webkit-box-pack:start;justify-content:flex-start}.justify-center{-webkit-box-pack:center;justify-content:center}.justify-around{justify-content:space-around}.content-center{align-content:center}.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.h-10{height:2.5rem}.h-12{height:3rem}.h-full{height:100%}.leading-normal{line-height:1.5}.m-0{margin:0}.mx-1{margin-left:.25rem;margin-right:.25rem}.mx-2{margin-left:.5rem;margin-right:.5rem}.my-auto{margin-top:auto;margin-bottom:auto}.mx-auto{margin-left:auto;margin-right:auto}.mr-1{margin-right:.25rem}.mb-1{margin-bottom:.25rem}.ml-1{margin-left:.25rem}.mt-2{margin-top:.5rem}.mr-2{margin-right:.5rem}.mt-3{margin-top:.75rem}.mt-4{margin-top:1rem}.mb-4{margin-bottom:1rem}.max-h-5\\/6{max-height:83%}.opacity-75{opacity:.75}.focus\\:outline-none:focus{outline:0}.overflow-auto{overflow:auto}.p-0{padding:0}.p-2{padding:.5rem}.px-1{padding-left:.25rem;padding-right:.25rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-4{padding-left:1rem;padding-right:1rem}.pb-1{padding-bottom:.25rem}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.top-0{top:0}.left-0{left:0}.fill-current{fill:currentColor}.stroke-current{stroke:currentColor}.text-justify{text-align:justify}.text-white{color:#fff}.text-bleuLBF{color:#4bbcc4}.text-vertLBF{color:#93c021}.text-rougeLBF{color:#e02933}.text-lbfbleu-600{color:#3ea1aa}.text-lbfvert-500{color:#93c021}.text-xs{font-size:.75rem}.text-sm{font-size:.875rem}.text-base{font-size:1rem}.text-lg{font-size:1.125rem}.text-xl{font-size:1.25rem}.w-12{width:3rem}.w-20{width:5rem}.w-5\\/6{width:83.333333%}.w-full{width:100%}.z-100{z-index:100}@media(min-width:640px){.sm\\:flex-row{-webkit-box-orient:horizontal;flex-direction:row}.sm\\:flex-row{-webkit-box-direction:normal}.sm\\:h-8{height:2rem}.sm\\:mr-2{margin-right:.5rem}.sm\\:text-xs{font-size:.75rem}.sm\\:w-8{width:2rem}.sm\\:w-12{width:3rem}.sm\\:w-20{width:5rem}.sm\\:w-3\\/4{width:75%}.sm\\:w-4\\/5{width:80%}}@media(min-width:768px){.md\\:text-sm{font-size:.875rem}.md\\:w-20{width:5rem}}@media(min-width:1024px){.lg\\:w-1\\/2{width:50%}}</style>`;
    		init(this, { target: this.shadowRoot }, instance, create_fragment, safe_not_equal, { id_atelier: 18 });

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
    		return ["id_atelier"];
    	}

    	get id_atelier() {
    		return this.$$.ctx[18];
    	}

    	set id_atelier(id_atelier) {
    		this.$set({ id_atelier });
    		flush();
    	}
    }

    customElements.define("une-inscription", Inscriptions);

    exports.appInscription = Inscriptions;

    return exports;

}({}));
//# sourceMappingURL=inscriptionAteliers.js.map
