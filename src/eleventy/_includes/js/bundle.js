var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
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
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
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
    function empty() {
        return text('');
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
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
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
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
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
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
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

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
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

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
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
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
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
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
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
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const getCalendarPage = (month, year, dayProps, weekStart = 0) => {
      let date = new Date(year, month, 1);
      date.setDate(date.getDate() - date.getDay() + weekStart);
      let nextMonth = month === 11 ? 0 : month + 1;
      // ensure days starts on Sunday
      // and end on saturday
      let weeks = [];
      while (date.getMonth() !== nextMonth || date.getDay() !== weekStart || weeks.length !== 6) {
        if (date.getDay() === weekStart) weeks.unshift({ days: [], id: `${year}${month}${year}${weeks.length}` });
        const updated = Object.assign({
          partOfMonth: date.getMonth() === month,
          day: date.getDate(),
          month: date.getMonth(),
          year: date.getFullYear(),
          date: new Date(date)
        }, dayProps(date));
        weeks[0].days.push(updated);
        date.setDate(date.getDate() + 1);
      }
      weeks.reverse();
      return { month, year, weeks };
    };

    const getDayPropsHandler = (start, end, selectableCallback) => {
      let today = new Date();
      today.setHours(0, 0, 0, 0);
      return date => {
        const isInRange = date >= start && date <= end;
        return {
          isInRange,
          selectable: isInRange && (!selectableCallback || selectableCallback(date)),
          isToday: date.getTime() === today.getTime()
        };
      };
    };

    function getMonths(start, end, selectableCallback = null, weekStart = 0) {
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      let endDate = new Date(end.getFullYear(), end.getMonth() + 1, 1);
      let months = [];
      let date = new Date(start.getFullYear(), start.getMonth(), 1);
      let dayPropsHandler = getDayPropsHandler(start, end, selectableCallback);
      while (date < endDate) {
        months.push(getCalendarPage(date.getMonth(), date.getFullYear(), dayPropsHandler, weekStart));
        date.setMonth(date.getMonth() + 1);
      }
      return months;
    }

    const areDatesEquivalent = (a, b) => a.getDate() === b.getDate()
      && a.getMonth() === b.getMonth()
      && a.getFullYear() === b.getFullYear();

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    /* src/svelte/components/calendar/Week.svelte generated by Svelte v3.24.0 */
    const file = "src/svelte/components/calendar/Week.svelte";

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-1f2gkwh-style";
    	style.textContent = ".week.svelte-1f2gkwh.svelte-1f2gkwh{padding:0;margin:0;display:-webkit-box;display:-moz-box;display:-ms-flexbox;display:-webkit-flex;display:flex;flex-flow:row;-webkit-flex-flow:row;justify-content:space-around;-ms-grid-column:1;grid-column:1}.week.svelte-1f2gkwh.svelte-1f2gkwh:nth-child(6n + 1){-ms-grid-row:1;grid-row:1}.week.svelte-1f2gkwh.svelte-1f2gkwh:nth-child(6n + 2){-ms-grid-row:2;grid-row:2}.week.svelte-1f2gkwh.svelte-1f2gkwh:nth-child(6n + 3){-ms-grid-row:3;grid-row:3}.week.svelte-1f2gkwh.svelte-1f2gkwh:nth-child(6n + 4){-ms-grid-row:4;grid-row:4}.week.svelte-1f2gkwh.svelte-1f2gkwh:nth-child(6n + 5){-ms-grid-row:5;grid-row:5}.week.svelte-1f2gkwh.svelte-1f2gkwh:nth-child(6n + 6){-ms-grid-row:6;grid-row:6}.day.svelte-1f2gkwh.svelte-1f2gkwh{margin:2px;color:var(--day-text-color);font-weight:bold;text-align:center;font-size:16px;flex:1 0 auto;height:auto;display:flex;flex-basis:0}.day.outside-month.svelte-1f2gkwh.svelte-1f2gkwh,.day.is-disabled.svelte-1f2gkwh.svelte-1f2gkwh{opacity:0.35}.day.svelte-1f2gkwh.svelte-1f2gkwh:before{content:'';float:left;padding-top:100%}.day--label.svelte-1f2gkwh.svelte-1f2gkwh{color:var(--day-text-color);display:flex;justify-content:center;flex-direction:column;width:100%;position:relative;border:1px solid #fff;border-radius:50%;margin:10%;padding:0;align-items:center;background:var(--day-background-color);cursor:pointer;transition:all 100ms linear;font-weight:normal}.day--label.disabled.svelte-1f2gkwh.svelte-1f2gkwh{cursor:default}@media(min-width: 480px){.day--label.highlighted.svelte-1f2gkwh.svelte-1f2gkwh,.day--label.svelte-1f2gkwh.svelte-1f2gkwh:not(.disabled):hover{background:var(--day-highlighted-background-color);border-color:var(--day-highlighted-background-color);color:var(--day-highlighted-text-color)}}.day--label.shake-date.svelte-1f2gkwh.svelte-1f2gkwh{animation:svelte-1f2gkwh-shake 0.4s 1 linear}.day--label.selected.svelte-1f2gkwh.svelte-1f2gkwh:hover,.day--label.selected.svelte-1f2gkwh.svelte-1f2gkwh,.day--label.svelte-1f2gkwh.svelte-1f2gkwh:active:not(.disabled){background-color:var(--highlight-color);border-color:var(--highlight-color);color:#fff}.day.is-today.svelte-1f2gkwh .day--label.svelte-1f2gkwh,.day.is-today.svelte-1f2gkwh .day--label.svelte-1f2gkwh:hover{opacity:1;background:none;border-color:var(--highlight-color);color:#000}@keyframes svelte-1f2gkwh-shake{0%{transform:translate(7px)}20%{transform:translate(-7px)}40%{transform:translate(3px)}60%{transform:translate(-3px)}80%{transform:translate(1px)}100%{transform:translate(0px)}}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2Vlay5zdmVsdGUiLCJzb3VyY2VzIjpbIldlZWsuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGltcG9ydCB7IGFyZURhdGVzRXF1aXZhbGVudCB9IGZyb20gJy4vbGliL2hlbHBlcnMnO1xuICBpbXBvcnQgeyBmbHksIGZhZGUgfSBmcm9tICdzdmVsdGUvdHJhbnNpdGlvbic7XG4gIGltcG9ydCB7IGNyZWF0ZUV2ZW50RGlzcGF0Y2hlciB9IGZyb20gJ3N2ZWx0ZSc7XG5cbiAgY29uc3QgZGlzcGF0Y2ggPSBjcmVhdGVFdmVudERpc3BhdGNoZXIoKTtcblxuICBleHBvcnQgbGV0IGRheXM7XG4gIGV4cG9ydCBsZXQgc2VsZWN0ZWQ7XG4gIGV4cG9ydCBsZXQgaGlnaGxpZ2h0ZWQ7XG4gIGV4cG9ydCBsZXQgc2hvdWxkU2hha2VEYXRlO1xuICBleHBvcnQgbGV0IGRpcmVjdGlvbjtcbjwvc2NyaXB0PlxyXG5cclxuPGRpdiBcclxuICBjbGFzcz1cIndlZWtcIiBcclxuICBpbjpmbHl8bG9jYWw9e3sgeDogZGlyZWN0aW9uICogNTAsIGR1cmF0aW9uOiAxODAsIGRlbGF5OiA5MCB9fVxyXG4gIG91dDpmYWRlfGxvY2FsPXt7IGR1cmF0aW9uOiAxODAgfX1cclxuPlxyXG4gIHsjZWFjaCBkYXlzIGFzIGRheX1cclxuICAgIDxkaXYgXHJcbiAgICAgIGNsYXNzPVwiZGF5XCIgXHJcbiAgICAgIGNsYXNzOm91dHNpZGUtbW9udGg9eyFkYXkucGFydE9mTW9udGh9XHJcbiAgICAgIGNsYXNzOmlzLXRvZGF5PXtkYXkuaXNUb2RheX1cclxuICAgICAgY2xhc3M6aXMtZGlzYWJsZWQ9eyFkYXkuc2VsZWN0YWJsZX1cclxuICAgID5cclxuICAgICAgPGJ1dHRvbiBcclxuICAgICAgICBjbGFzcz1cImRheS0tbGFiZWxcIiBcclxuICAgICAgICBjbGFzczpzZWxlY3RlZD17YXJlRGF0ZXNFcXVpdmFsZW50KGRheS5kYXRlLCBzZWxlY3RlZCl9XHJcbiAgICAgICAgY2xhc3M6aGlnaGxpZ2h0ZWQ9e2FyZURhdGVzRXF1aXZhbGVudChkYXkuZGF0ZSwgaGlnaGxpZ2h0ZWQpfVxyXG4gICAgICAgIGNsYXNzOnNoYWtlLWRhdGU9e3Nob3VsZFNoYWtlRGF0ZSAmJiBhcmVEYXRlc0VxdWl2YWxlbnQoZGF5LmRhdGUsIHNob3VsZFNoYWtlRGF0ZSl9XHJcbiAgICAgICAgY2xhc3M6ZGlzYWJsZWQ9eyFkYXkuc2VsZWN0YWJsZX1cclxuICAgICAgICB0eXBlPVwiYnV0dG9uXCJcclxuICAgICAgICBvbjpjbGljaz17KCkgPT4gZGlzcGF0Y2goJ2RhdGVTZWxlY3RlZCcsIGRheS5kYXRlKX1cclxuICAgICAgPlxyXG4gICAgICAgIHtkYXkuZGF0ZS5nZXREYXRlKCl9XHJcbiAgICAgIDwvYnV0dG9uPlxyXG4gICAgPC9kaXY+XHJcbiAgey9lYWNofVxyXG48L2Rpdj5cclxuXHJcbjxzdHlsZT5cclxuICAud2VlayB7IFxyXG4gICAgcGFkZGluZzogMDtcclxuICAgIG1hcmdpbjogMDtcclxuICAgIGRpc3BsYXk6IC13ZWJraXQtYm94O1xyXG4gICAgZGlzcGxheTogLW1vei1ib3g7XHJcbiAgICBkaXNwbGF5OiAtbXMtZmxleGJveDtcclxuICAgIGRpc3BsYXk6IC13ZWJraXQtZmxleDtcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBmbGV4LWZsb3c6IHJvdztcclxuICAgIC13ZWJraXQtZmxleC1mbG93OiByb3c7XHJcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWFyb3VuZDtcclxuICAgIC1tcy1ncmlkLWNvbHVtbjogMTtcclxuICAgIGdyaWQtY29sdW1uOiAxOyBcclxuICB9XHJcbiAgLndlZWs6bnRoLWNoaWxkKDZuICsgMSkgeyBcclxuICAgIC1tcy1ncmlkLXJvdzogMTsgXHJcbiAgICBncmlkLXJvdzogMTsgXHJcbiAgfVxyXG4gIC53ZWVrOm50aC1jaGlsZCg2biArIDIpIHsgXHJcbiAgICAtbXMtZ3JpZC1yb3c6IDI7IFxyXG4gICAgZ3JpZC1yb3c6IDI7IFxyXG4gIH1cclxuICAud2VlazpudGgtY2hpbGQoNm4gKyAzKSB7IFxyXG4gICAgLW1zLWdyaWQtcm93OiAzOyBcclxuICAgIGdyaWQtcm93OiAzOyBcclxuICB9XHJcbiAgLndlZWs6bnRoLWNoaWxkKDZuICsgNCkgeyBcclxuICAgIC1tcy1ncmlkLXJvdzogNDsgXHJcbiAgICBncmlkLXJvdzogNDsgXHJcbiAgfVxyXG4gIC53ZWVrOm50aC1jaGlsZCg2biArIDUpIHsgXHJcbiAgICAtbXMtZ3JpZC1yb3c6IDU7IFxyXG4gICAgZ3JpZC1yb3c6IDU7IFxyXG4gIH1cclxuICAud2VlazpudGgtY2hpbGQoNm4gKyA2KSB7IFxyXG4gICAgLW1zLWdyaWQtcm93OiA2OyBcclxuICAgIGdyaWQtcm93OiA2OyBcclxuICB9XHJcbiAgLmRheSB7IFxyXG4gICAgbWFyZ2luOiAycHg7XHJcbiAgICBjb2xvcjogdmFyKC0tZGF5LXRleHQtY29sb3IpO1xyXG4gICAgZm9udC13ZWlnaHQ6IGJvbGQ7XHJcbiAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XHJcbiAgICBmb250LXNpemU6IDE2cHg7XHJcbiAgICBmbGV4OiAxIDAgYXV0bztcclxuICAgIGhlaWdodDogYXV0bztcclxuICAgIGRpc3BsYXk6IGZsZXg7IFxyXG4gICAgZmxleC1iYXNpczogMDtcclxuICB9XHJcbiAgLmRheS5vdXRzaWRlLW1vbnRoLCBcclxuICAuZGF5LmlzLWRpc2FibGVkIHsgXHJcbiAgICBvcGFjaXR5OiAwLjM1O1xyXG4gIH1cclxuICAuZGF5OmJlZm9yZSB7IFxyXG4gICAgY29udGVudDogJyc7XHJcbiAgICBmbG9hdDogbGVmdDtcclxuICAgIHBhZGRpbmctdG9wOiAxMDAlO1xyXG4gIH1cclxuICAuZGF5LS1sYWJlbCB7IFxyXG4gICAgY29sb3I6IHZhcigtLWRheS10ZXh0LWNvbG9yKTtcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcclxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XHJcbiAgICB3aWR0aDogMTAwJTtcclxuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcclxuICAgIGJvcmRlcjogMXB4IHNvbGlkICNmZmY7XHJcbiAgICBib3JkZXItcmFkaXVzOiA1MCU7IFxyXG4gICAgbWFyZ2luOiAxMCU7XHJcbiAgICBwYWRkaW5nOiAwO1xyXG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcclxuICAgIGJhY2tncm91bmQ6IHZhcigtLWRheS1iYWNrZ3JvdW5kLWNvbG9yKTtcclxuICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICAgIHRyYW5zaXRpb246IGFsbCAxMDBtcyBsaW5lYXI7XHJcbiAgICBmb250LXdlaWdodDogbm9ybWFsO1xyXG4gIH1cclxuICAuZGF5LS1sYWJlbC5kaXNhYmxlZCB7IFxyXG4gICAgY3Vyc29yOiBkZWZhdWx0O1xyXG4gIH1cclxuICBAbWVkaWEgKG1pbi13aWR0aDogNDgwcHgpIHsgXHJcbiAgICAuZGF5LS1sYWJlbC5oaWdobGlnaHRlZCxcclxuICAgIC5kYXktLWxhYmVsOm5vdCguZGlzYWJsZWQpOmhvdmVyIHsgXHJcbiAgICAgIGJhY2tncm91bmQ6IHZhcigtLWRheS1oaWdobGlnaHRlZC1iYWNrZ3JvdW5kLWNvbG9yKTtcclxuICAgICAgYm9yZGVyLWNvbG9yOiB2YXIoLS1kYXktaGlnaGxpZ2h0ZWQtYmFja2dyb3VuZC1jb2xvcik7XHJcbiAgICAgIGNvbG9yOiB2YXIoLS1kYXktaGlnaGxpZ2h0ZWQtdGV4dC1jb2xvcik7XHJcbiAgICB9XHJcbiAgfVxyXG4gIC5kYXktLWxhYmVsLnNoYWtlLWRhdGUgeyBcclxuICAgIGFuaW1hdGlvbjogc2hha2UgMC40cyAxIGxpbmVhcjtcclxuICB9XHJcbiAgLmRheS0tbGFiZWwuc2VsZWN0ZWQ6aG92ZXIsXHJcbiAgLmRheS0tbGFiZWwuc2VsZWN0ZWQsXHJcbiAgLmRheS0tbGFiZWw6YWN0aXZlOm5vdCguZGlzYWJsZWQpIHsgXHJcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS1oaWdobGlnaHQtY29sb3IpO1xyXG4gICAgYm9yZGVyLWNvbG9yOiB2YXIoLS1oaWdobGlnaHQtY29sb3IpO1xyXG4gICAgY29sb3I6ICNmZmY7XHJcbiAgfVxyXG4gIC5kYXkuaXMtdG9kYXkgLmRheS0tbGFiZWwsIFxyXG4gIC5kYXkuaXMtdG9kYXkgLmRheS0tbGFiZWw6aG92ZXIgeyBcclxuICAgIG9wYWNpdHk6IDE7IFxyXG4gICAgYmFja2dyb3VuZDogbm9uZTtcclxuICAgIGJvcmRlci1jb2xvcjogdmFyKC0taGlnaGxpZ2h0LWNvbG9yKTtcclxuICAgIGNvbG9yOiAjMDAwO1xyXG4gIH1cclxuXHJcbiAgQGtleWZyYW1lcyBzaGFrZSB7XHJcbiAgICAwJSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlKDdweCk7IH1cclxuICAgIDIwJSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlKC03cHgpOyB9XHJcbiAgICA0MCUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgzcHgpOyB9XHJcbiAgICA2MCUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtM3B4KTsgfVxyXG4gICAgODAlIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGUoMXB4KTsgfVxyXG4gICAgMTAwJSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlKDBweCk7IH1cclxuICB9XHJcbjwvc3R5bGU+XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUEwQ0UsS0FBSyw4QkFBQyxDQUFDLEFBQ0wsT0FBTyxDQUFFLENBQUMsQ0FDVixNQUFNLENBQUUsQ0FBQyxDQUNULE9BQU8sQ0FBRSxXQUFXLENBQ3BCLE9BQU8sQ0FBRSxRQUFRLENBQ2pCLE9BQU8sQ0FBRSxXQUFXLENBQ3BCLE9BQU8sQ0FBRSxZQUFZLENBQ3JCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsU0FBUyxDQUFFLEdBQUcsQ0FDZCxpQkFBaUIsQ0FBRSxHQUFHLENBQ3RCLGVBQWUsQ0FBRSxZQUFZLENBQzdCLGVBQWUsQ0FBRSxDQUFDLENBQ2xCLFdBQVcsQ0FBRSxDQUFDLEFBQ2hCLENBQUMsQUFDRCxtQ0FBSyxXQUFXLE1BQU0sQ0FBQyxBQUFDLENBQUMsQUFDdkIsWUFBWSxDQUFFLENBQUMsQ0FDZixRQUFRLENBQUUsQ0FBQyxBQUNiLENBQUMsQUFDRCxtQ0FBSyxXQUFXLE1BQU0sQ0FBQyxBQUFDLENBQUMsQUFDdkIsWUFBWSxDQUFFLENBQUMsQ0FDZixRQUFRLENBQUUsQ0FBQyxBQUNiLENBQUMsQUFDRCxtQ0FBSyxXQUFXLE1BQU0sQ0FBQyxBQUFDLENBQUMsQUFDdkIsWUFBWSxDQUFFLENBQUMsQ0FDZixRQUFRLENBQUUsQ0FBQyxBQUNiLENBQUMsQUFDRCxtQ0FBSyxXQUFXLE1BQU0sQ0FBQyxBQUFDLENBQUMsQUFDdkIsWUFBWSxDQUFFLENBQUMsQ0FDZixRQUFRLENBQUUsQ0FBQyxBQUNiLENBQUMsQUFDRCxtQ0FBSyxXQUFXLE1BQU0sQ0FBQyxBQUFDLENBQUMsQUFDdkIsWUFBWSxDQUFFLENBQUMsQ0FDZixRQUFRLENBQUUsQ0FBQyxBQUNiLENBQUMsQUFDRCxtQ0FBSyxXQUFXLE1BQU0sQ0FBQyxBQUFDLENBQUMsQUFDdkIsWUFBWSxDQUFFLENBQUMsQ0FDZixRQUFRLENBQUUsQ0FBQyxBQUNiLENBQUMsQUFDRCxJQUFJLDhCQUFDLENBQUMsQUFDSixNQUFNLENBQUUsR0FBRyxDQUNYLEtBQUssQ0FBRSxJQUFJLGdCQUFnQixDQUFDLENBQzVCLFdBQVcsQ0FBRSxJQUFJLENBQ2pCLFVBQVUsQ0FBRSxNQUFNLENBQ2xCLFNBQVMsQ0FBRSxJQUFJLENBQ2YsSUFBSSxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUNkLE1BQU0sQ0FBRSxJQUFJLENBQ1osT0FBTyxDQUFFLElBQUksQ0FDYixVQUFVLENBQUUsQ0FBQyxBQUNmLENBQUMsQUFDRCxJQUFJLDRDQUFjLENBQ2xCLElBQUksWUFBWSw4QkFBQyxDQUFDLEFBQ2hCLE9BQU8sQ0FBRSxJQUFJLEFBQ2YsQ0FBQyxBQUNELGtDQUFJLE9BQU8sQUFBQyxDQUFDLEFBQ1gsT0FBTyxDQUFFLEVBQUUsQ0FDWCxLQUFLLENBQUUsSUFBSSxDQUNYLFdBQVcsQ0FBRSxJQUFJLEFBQ25CLENBQUMsQUFDRCxXQUFXLDhCQUFDLENBQUMsQUFDWCxLQUFLLENBQUUsSUFBSSxnQkFBZ0IsQ0FBQyxDQUM1QixPQUFPLENBQUUsSUFBSSxDQUNiLGVBQWUsQ0FBRSxNQUFNLENBQ3ZCLGNBQWMsQ0FBRSxNQUFNLENBQ3RCLEtBQUssQ0FBRSxJQUFJLENBQ1gsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUN0QixhQUFhLENBQUUsR0FBRyxDQUNsQixNQUFNLENBQUUsR0FBRyxDQUNYLE9BQU8sQ0FBRSxDQUFDLENBQ1YsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsVUFBVSxDQUFFLElBQUksc0JBQXNCLENBQUMsQ0FDdkMsQ0FBQyxLQUFLLENBQUUsT0FBTyxDQUNmLFVBQVUsQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FDNUIsV0FBVyxDQUFFLE1BQU0sQUFDckIsQ0FBQyxBQUNELFdBQVcsU0FBUyw4QkFBQyxDQUFDLEFBQ3BCLE1BQU0sQ0FBRSxPQUFPLEFBQ2pCLENBQUMsQUFDRCxNQUFNLEFBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxBQUFDLENBQUMsQUFDekIsV0FBVywwQ0FBWSxDQUN2Qix5Q0FBVyxLQUFLLFNBQVMsQ0FBQyxFQUFFLElBQUksQUFBQyxDQUFDLEFBQ2hDLFVBQVUsQ0FBRSxJQUFJLGtDQUFrQyxDQUFDLENBQ25ELEVBQUUsVUFBVSxDQUFFLElBQUksa0NBQWtDLENBQUMsQ0FDckQsS0FBSyxDQUFFLElBQUksTUFBTSxzQkFBc0IsQ0FBQyxBQUMxQyxDQUFDLEFBQ0gsQ0FBQyxBQUNELFdBQVcsV0FBVyw4QkFBQyxDQUFDLEFBQ3RCLFNBQVMsQ0FBRSxvQkFBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxBQUNoQyxDQUFDLEFBQ0QsV0FBVyx1Q0FBUyxNQUFNLENBQzFCLFdBQVcsdUNBQVMsQ0FDcEIseUNBQVcsT0FBTyxLQUFLLFNBQVMsQ0FBQyxBQUFDLENBQUMsQUFDakMsZ0JBQWdCLENBQUUsSUFBSSxpQkFBaUIsQ0FBQyxDQUN4QyxZQUFZLENBQUUsSUFBSSxpQkFBaUIsQ0FBQyxDQUNwQyxLQUFLLENBQUUsSUFBSSxBQUNiLENBQUMsQUFDRCxJQUFJLHdCQUFTLENBQUMsMEJBQVcsQ0FDekIsSUFBSSx3QkFBUyxDQUFDLDBCQUFXLE1BQU0sQUFBQyxDQUFDLEFBQy9CLE9BQU8sQ0FBRSxDQUFDLENBQ1YsVUFBVSxDQUFFLElBQUksQ0FDaEIsWUFBWSxDQUFFLElBQUksaUJBQWlCLENBQUMsQ0FDcEMsS0FBSyxDQUFFLElBQUksQUFDYixDQUFDLEFBRUQsV0FBVyxvQkFBTSxDQUFDLEFBQ2hCLEVBQUUsQUFBQyxDQUFDLEFBQUMsU0FBUyxDQUFFLFVBQVUsR0FBRyxDQUFDLEFBQUUsQ0FBQyxBQUNqQyxHQUFHLEFBQUMsQ0FBQyxBQUFDLFNBQVMsQ0FBRSxVQUFVLElBQUksQ0FBQyxBQUFFLENBQUMsQUFDbkMsR0FBRyxBQUFDLENBQUMsQUFBQyxTQUFTLENBQUUsVUFBVSxHQUFHLENBQUMsQUFBRSxDQUFDLEFBQ2xDLEdBQUcsQUFBQyxDQUFDLEFBQUMsU0FBUyxDQUFFLFVBQVUsSUFBSSxDQUFDLEFBQUUsQ0FBQyxBQUNuQyxHQUFHLEFBQUMsQ0FBQyxBQUFDLFNBQVMsQ0FBRSxVQUFVLEdBQUcsQ0FBQyxBQUFFLENBQUMsQUFDbEMsSUFBSSxBQUFDLENBQUMsQUFBQyxTQUFTLENBQUUsVUFBVSxHQUFHLENBQUMsQUFBRSxDQUFDLEFBQ3JDLENBQUMifQ== */";
    	append_dev(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	return child_ctx;
    }

    // (20:2) {#each days as day}
    function create_each_block(ctx) {
    	let div;
    	let button;
    	let t0_value = /*day*/ ctx[7].date.getDate() + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[6](/*day*/ ctx[7], ...args);
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			button = element("button");
    			t0 = text(t0_value);
    			t1 = space();
    			attr_dev(button, "class", "day--label svelte-1f2gkwh");
    			attr_dev(button, "type", "button");
    			toggle_class(button, "selected", areDatesEquivalent(/*day*/ ctx[7].date, /*selected*/ ctx[1]));
    			toggle_class(button, "highlighted", areDatesEquivalent(/*day*/ ctx[7].date, /*highlighted*/ ctx[2]));
    			toggle_class(button, "shake-date", /*shouldShakeDate*/ ctx[3] && areDatesEquivalent(/*day*/ ctx[7].date, /*shouldShakeDate*/ ctx[3]));
    			toggle_class(button, "disabled", !/*day*/ ctx[7].selectable);
    			add_location(button, file, 26, 6, 666);
    			attr_dev(div, "class", "day svelte-1f2gkwh");
    			toggle_class(div, "outside-month", !/*day*/ ctx[7].partOfMonth);
    			toggle_class(div, "is-today", /*day*/ ctx[7].isToday);
    			toggle_class(div, "is-disabled", !/*day*/ ctx[7].selectable);
    			add_location(div, file, 20, 4, 501);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, button);
    			append_dev(button, t0);
    			append_dev(div, t1);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*days*/ 1 && t0_value !== (t0_value = /*day*/ ctx[7].date.getDate() + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*areDatesEquivalent, days, selected*/ 3) {
    				toggle_class(button, "selected", areDatesEquivalent(/*day*/ ctx[7].date, /*selected*/ ctx[1]));
    			}

    			if (dirty & /*areDatesEquivalent, days, highlighted*/ 5) {
    				toggle_class(button, "highlighted", areDatesEquivalent(/*day*/ ctx[7].date, /*highlighted*/ ctx[2]));
    			}

    			if (dirty & /*shouldShakeDate, areDatesEquivalent, days*/ 9) {
    				toggle_class(button, "shake-date", /*shouldShakeDate*/ ctx[3] && areDatesEquivalent(/*day*/ ctx[7].date, /*shouldShakeDate*/ ctx[3]));
    			}

    			if (dirty & /*days*/ 1) {
    				toggle_class(button, "disabled", !/*day*/ ctx[7].selectable);
    			}

    			if (dirty & /*days*/ 1) {
    				toggle_class(div, "outside-month", !/*day*/ ctx[7].partOfMonth);
    			}

    			if (dirty & /*days*/ 1) {
    				toggle_class(div, "is-today", /*day*/ ctx[7].isToday);
    			}

    			if (dirty & /*days*/ 1) {
    				toggle_class(div, "is-disabled", !/*day*/ ctx[7].selectable);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(20:2) {#each days as day}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div;
    	let div_intro;
    	let div_outro;
    	let current;
    	let each_value = /*days*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "week svelte-1f2gkwh");
    			add_location(div, file, 14, 0, 343);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*days, areDatesEquivalent, selected, highlighted, shouldShakeDate, dispatch*/ 47) {
    				each_value = /*days*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			if (local) {
    				add_render_callback(() => {
    					if (div_outro) div_outro.end(1);

    					if (!div_intro) div_intro = create_in_transition(div, fly, {
    						x: /*direction*/ ctx[4] * 50,
    						duration: 180,
    						delay: 90
    					});

    					div_intro.start();
    				});
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			if (div_intro) div_intro.invalidate();

    			if (local) {
    				div_outro = create_out_transition(div, fade, { duration: 180 });
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    			if (detaching && div_outro) div_outro.end();
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
    	const dispatch = createEventDispatcher();
    	let { days } = $$props;
    	let { selected } = $$props;
    	let { highlighted } = $$props;
    	let { shouldShakeDate } = $$props;
    	let { direction } = $$props;
    	const writable_props = ["days", "selected", "highlighted", "shouldShakeDate", "direction"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Week> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Week", $$slots, []);
    	const click_handler = day => dispatch("dateSelected", day.date);

    	$$self.$set = $$props => {
    		if ("days" in $$props) $$invalidate(0, days = $$props.days);
    		if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
    		if ("highlighted" in $$props) $$invalidate(2, highlighted = $$props.highlighted);
    		if ("shouldShakeDate" in $$props) $$invalidate(3, shouldShakeDate = $$props.shouldShakeDate);
    		if ("direction" in $$props) $$invalidate(4, direction = $$props.direction);
    	};

    	$$self.$capture_state = () => ({
    		areDatesEquivalent,
    		fly,
    		fade,
    		createEventDispatcher,
    		dispatch,
    		days,
    		selected,
    		highlighted,
    		shouldShakeDate,
    		direction
    	});

    	$$self.$inject_state = $$props => {
    		if ("days" in $$props) $$invalidate(0, days = $$props.days);
    		if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
    		if ("highlighted" in $$props) $$invalidate(2, highlighted = $$props.highlighted);
    		if ("shouldShakeDate" in $$props) $$invalidate(3, shouldShakeDate = $$props.shouldShakeDate);
    		if ("direction" in $$props) $$invalidate(4, direction = $$props.direction);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		days,
    		selected,
    		highlighted,
    		shouldShakeDate,
    		direction,
    		dispatch,
    		click_handler
    	];
    }

    class Week extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1f2gkwh-style")) add_css();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			days: 0,
    			selected: 1,
    			highlighted: 2,
    			shouldShakeDate: 3,
    			direction: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Week",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*days*/ ctx[0] === undefined && !("days" in props)) {
    			console.warn("<Week> was created without expected prop 'days'");
    		}

    		if (/*selected*/ ctx[1] === undefined && !("selected" in props)) {
    			console.warn("<Week> was created without expected prop 'selected'");
    		}

    		if (/*highlighted*/ ctx[2] === undefined && !("highlighted" in props)) {
    			console.warn("<Week> was created without expected prop 'highlighted'");
    		}

    		if (/*shouldShakeDate*/ ctx[3] === undefined && !("shouldShakeDate" in props)) {
    			console.warn("<Week> was created without expected prop 'shouldShakeDate'");
    		}

    		if (/*direction*/ ctx[4] === undefined && !("direction" in props)) {
    			console.warn("<Week> was created without expected prop 'direction'");
    		}
    	}

    	get days() {
    		throw new Error("<Week>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set days(value) {
    		throw new Error("<Week>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selected() {
    		throw new Error("<Week>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selected(value) {
    		throw new Error("<Week>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get highlighted() {
    		throw new Error("<Week>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set highlighted(value) {
    		throw new Error("<Week>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get shouldShakeDate() {
    		throw new Error("<Week>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set shouldShakeDate(value) {
    		throw new Error("<Week>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get direction() {
    		throw new Error("<Week>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set direction(value) {
    		throw new Error("<Week>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/svelte/components/calendar/Month.svelte generated by Svelte v3.24.0 */
    const file$1 = "src/svelte/components/calendar/Month.svelte";

    function add_css$1() {
    	var style = element("style");
    	style.id = "svelte-ny3kda-style";
    	style.textContent = ".month-container.svelte-ny3kda{width:100%;display:-ms-grid;display:grid;-ms-grid-columns:1fr;-ms-grid-rows:1fr}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9udGguc3ZlbHRlIiwic291cmNlcyI6WyJNb250aC5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cbiAgaW1wb3J0IFdlZWsgZnJvbSAnLi9XZWVrLnN2ZWx0ZSc7XG5cbiAgZXhwb3J0IGxldCBpZDtcbiAgZXhwb3J0IGxldCB2aXNpYmxlTW9udGg7XG4gIGV4cG9ydCBsZXQgc2VsZWN0ZWQ7XG4gIGV4cG9ydCBsZXQgaGlnaGxpZ2h0ZWQ7XG4gIGV4cG9ydCBsZXQgc2hvdWxkU2hha2VEYXRlO1xuXG4gIGxldCBsYXN0SWQgPSBpZDtcbiAgbGV0IGRpcmVjdGlvbjtcblxuICAkOiB7XG4gICAgZGlyZWN0aW9uID0gbGFzdElkIDwgaWQgPyAxIDogLTE7XG4gICAgbGFzdElkID0gaWQ7XG4gIH1cbjwvc2NyaXB0PlxyXG5cclxuPGRpdiBjbGFzcz1cIm1vbnRoLWNvbnRhaW5lclwiPlxyXG4gIHsjZWFjaCB2aXNpYmxlTW9udGgud2Vla3MgYXMgd2VlayAod2Vlay5pZCkgfVxyXG4gICAgPFdlZWsgXHJcbiAgICAgIGRheXM9e3dlZWsuZGF5c30gXHJcbiAgICAgIHtzZWxlY3RlZH0gXHJcbiAgICAgIHtoaWdobGlnaHRlZH0gXHJcbiAgICAgIHtzaG91bGRTaGFrZURhdGV9IFxyXG4gICAgICB7ZGlyZWN0aW9ufVxyXG4gICAgICBvbjpkYXRlU2VsZWN0ZWQgXHJcbiAgICAvPlxyXG4gIHsvZWFjaH1cclxuPC9kaXY+XHJcblxyXG48c3R5bGU+XHJcbiAgLm1vbnRoLWNvbnRhaW5lciB7IFxyXG4gICAgd2lkdGg6IDEwMCU7XHJcbiAgICBkaXNwbGF5OiAtbXMtZ3JpZDtcclxuICAgIGRpc3BsYXk6IGdyaWQ7XHJcbiAgICAtbXMtZ3JpZC1jb2x1bW5zOiAxZnI7XHJcbiAgICAtbXMtZ3JpZC1yb3dzOiAxZnI7XHJcbiAgfVxyXG48L3N0eWxlPlxyXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBZ0NFLGdCQUFnQixjQUFDLENBQUMsQUFDaEIsS0FBSyxDQUFFLElBQUksQ0FDWCxPQUFPLENBQUUsUUFBUSxDQUNqQixPQUFPLENBQUUsSUFBSSxDQUNiLGdCQUFnQixDQUFFLEdBQUcsQ0FDckIsYUFBYSxDQUFFLEdBQUcsQUFDcEIsQ0FBQyJ9 */";
    	append_dev(document.head, style);
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	return child_ctx;
    }

    // (20:2) {#each visibleMonth.weeks as week (week.id) }
    function create_each_block$1(key_1, ctx) {
    	let first;
    	let week;
    	let current;

    	week = new Week({
    			props: {
    				days: /*week*/ ctx[8].days,
    				selected: /*selected*/ ctx[1],
    				highlighted: /*highlighted*/ ctx[2],
    				shouldShakeDate: /*shouldShakeDate*/ ctx[3],
    				direction: /*direction*/ ctx[4]
    			},
    			$$inline: true
    		});

    	week.$on("dateSelected", /*dateSelected_handler*/ ctx[6]);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(week.$$.fragment);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(week, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const week_changes = {};
    			if (dirty & /*visibleMonth*/ 1) week_changes.days = /*week*/ ctx[8].days;
    			if (dirty & /*selected*/ 2) week_changes.selected = /*selected*/ ctx[1];
    			if (dirty & /*highlighted*/ 4) week_changes.highlighted = /*highlighted*/ ctx[2];
    			if (dirty & /*shouldShakeDate*/ 8) week_changes.shouldShakeDate = /*shouldShakeDate*/ ctx[3];
    			if (dirty & /*direction*/ 16) week_changes.direction = /*direction*/ ctx[4];
    			week.$set(week_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(week.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(week.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(week, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(20:2) {#each visibleMonth.weeks as week (week.id) }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value = /*visibleMonth*/ ctx[0].weeks;
    	validate_each_argument(each_value);
    	const get_key = ctx => /*week*/ ctx[8].id;
    	validate_each_keys(ctx, each_value, get_each_context$1, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "month-container svelte-ny3kda");
    			add_location(div, file$1, 18, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*visibleMonth, selected, highlighted, shouldShakeDate, direction*/ 31) {
    				const each_value = /*visibleMonth*/ ctx[0].weeks;
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context$1, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, outro_and_destroy_block, create_each_block$1, null, get_each_context$1);
    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
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
    	let { id } = $$props;
    	let { visibleMonth } = $$props;
    	let { selected } = $$props;
    	let { highlighted } = $$props;
    	let { shouldShakeDate } = $$props;
    	let lastId = id;
    	let direction;
    	const writable_props = ["id", "visibleMonth", "selected", "highlighted", "shouldShakeDate"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Month> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Month", $$slots, []);

    	function dateSelected_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("id" in $$props) $$invalidate(5, id = $$props.id);
    		if ("visibleMonth" in $$props) $$invalidate(0, visibleMonth = $$props.visibleMonth);
    		if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
    		if ("highlighted" in $$props) $$invalidate(2, highlighted = $$props.highlighted);
    		if ("shouldShakeDate" in $$props) $$invalidate(3, shouldShakeDate = $$props.shouldShakeDate);
    	};

    	$$self.$capture_state = () => ({
    		Week,
    		id,
    		visibleMonth,
    		selected,
    		highlighted,
    		shouldShakeDate,
    		lastId,
    		direction
    	});

    	$$self.$inject_state = $$props => {
    		if ("id" in $$props) $$invalidate(5, id = $$props.id);
    		if ("visibleMonth" in $$props) $$invalidate(0, visibleMonth = $$props.visibleMonth);
    		if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
    		if ("highlighted" in $$props) $$invalidate(2, highlighted = $$props.highlighted);
    		if ("shouldShakeDate" in $$props) $$invalidate(3, shouldShakeDate = $$props.shouldShakeDate);
    		if ("lastId" in $$props) $$invalidate(7, lastId = $$props.lastId);
    		if ("direction" in $$props) $$invalidate(4, direction = $$props.direction);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*lastId, id*/ 160) {
    			 {
    				$$invalidate(4, direction = lastId < id ? 1 : -1);
    				$$invalidate(7, lastId = id);
    			}
    		}
    	};

    	return [
    		visibleMonth,
    		selected,
    		highlighted,
    		shouldShakeDate,
    		direction,
    		id,
    		dateSelected_handler
    	];
    }

    class Month extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-ny3kda-style")) add_css$1();

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			id: 5,
    			visibleMonth: 0,
    			selected: 1,
    			highlighted: 2,
    			shouldShakeDate: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Month",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*id*/ ctx[5] === undefined && !("id" in props)) {
    			console.warn("<Month> was created without expected prop 'id'");
    		}

    		if (/*visibleMonth*/ ctx[0] === undefined && !("visibleMonth" in props)) {
    			console.warn("<Month> was created without expected prop 'visibleMonth'");
    		}

    		if (/*selected*/ ctx[1] === undefined && !("selected" in props)) {
    			console.warn("<Month> was created without expected prop 'selected'");
    		}

    		if (/*highlighted*/ ctx[2] === undefined && !("highlighted" in props)) {
    			console.warn("<Month> was created without expected prop 'highlighted'");
    		}

    		if (/*shouldShakeDate*/ ctx[3] === undefined && !("shouldShakeDate" in props)) {
    			console.warn("<Month> was created without expected prop 'shouldShakeDate'");
    		}
    	}

    	get id() {
    		throw new Error("<Month>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Month>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get visibleMonth() {
    		throw new Error("<Month>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set visibleMonth(value) {
    		throw new Error("<Month>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selected() {
    		throw new Error("<Month>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selected(value) {
    		throw new Error("<Month>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get highlighted() {
    		throw new Error("<Month>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set highlighted(value) {
    		throw new Error("<Month>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get shouldShakeDate() {
    		throw new Error("<Month>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set shouldShakeDate(value) {
    		throw new Error("<Month>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/svelte/components/calendar/NavBar.svelte generated by Svelte v3.24.0 */

    const { Object: Object_1 } = globals;
    const file$2 = "src/svelte/components/calendar/NavBar.svelte";

    function add_css$2() {
    	var style = element("style");
    	style.id = "svelte-1dqf106-style";
    	style.textContent = ".heading-section.svelte-1dqf106.svelte-1dqf106{font-size:20px;padding:24px 15px;display:flex;justify-content:space-between;color:#3d4548;font-weight:bold}.label.svelte-1dqf106.svelte-1dqf106{cursor:pointer}.month-selector.svelte-1dqf106.svelte-1dqf106{position:absolute;top:75px;left:0;right:0;bottom:0;background-color:#fff;transition:all 300ms;transform:scale(1.2);opacity:0;visibility:hidden;z-index:1;text-align:center}.month-selector.open.svelte-1dqf106.svelte-1dqf106{transform:scale(1);visibility:visible;opacity:1}.month-selector--month.svelte-1dqf106.svelte-1dqf106{width:31.333%;margin:.5%;height:23%;display:inline-block;color:#4a4a4a;border:1px solid #efefef;opacity:0.2}.month-selector--month.selectable.svelte-1dqf106.svelte-1dqf106{opacity:1}.month-selector--month.selectable.svelte-1dqf106.svelte-1dqf106:hover{cursor:pointer;box-shadow:0px 0px 3px rgba(0,0,0,0.15)}.month-selector--month.selected.svelte-1dqf106.svelte-1dqf106{background:var(--highlight-color);color:#fff}.month-selector--month.svelte-1dqf106.svelte-1dqf106:before{content:' ';display:inline-block;height:100%;vertical-align:middle}.month-selector--month.svelte-1dqf106 span.svelte-1dqf106{vertical-align:middle;display:inline-block}.control.svelte-1dqf106.svelte-1dqf106{padding:0 8px;opacity:0.2;transform:translateY(3px)}.control.enabled.svelte-1dqf106.svelte-1dqf106{opacity:1;cursor:pointer}.arrow.svelte-1dqf106.svelte-1dqf106{display:inline-block;width:18px;height:18px;border-style:solid;border-color:#a9a9a9;border-width:0;border-bottom-width:2px;border-right-width:2px}.arrow.right.svelte-1dqf106.svelte-1dqf106{transform:rotate(-45deg);-webkit-transform:rotate(-45deg)}.arrow.left.svelte-1dqf106.svelte-1dqf106{transform:rotate(135deg);-webkit-transform:rotate(135deg)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmF2QmFyLnN2ZWx0ZSIsInNvdXJjZXMiOlsiTmF2QmFyLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgeyBjcmVhdGVFdmVudERpc3BhdGNoZXIgfSBmcm9tICdzdmVsdGUnO1xuXG4gIGNvbnN0IGRpc3BhdGNoID0gY3JlYXRlRXZlbnREaXNwYXRjaGVyKCk7XG5cbiAgZXhwb3J0IGxldCBtb250aDtcbiAgZXhwb3J0IGxldCB5ZWFyO1xuICBleHBvcnQgbGV0IHN0YXJ0O1xuICBleHBvcnQgbGV0IGVuZDtcbiAgZXhwb3J0IGxldCBjYW5JbmNyZW1lbnRNb250aDtcbiAgZXhwb3J0IGxldCBjYW5EZWNyZW1lbnRNb250aDtcbiAgZXhwb3J0IGxldCBtb250aHNPZlllYXI7XG5cbiAgbGV0IG1vbnRoU2VsZWN0b3JPcGVuID0gZmFsc2U7XG4gIGxldCBhdmFpbGFibGVNb250aHM7XG5cbiAgJDoge1xuICAgIGxldCBpc09uTG93ZXJCb3VuZGFyeSA9IHN0YXJ0LmdldEZ1bGxZZWFyKCkgPT09IHllYXI7XG4gICAgbGV0IGlzT25VcHBlckJvdW5kYXJ5ID0gZW5kLmdldEZ1bGxZZWFyKCkgPT09IHllYXI7XG4gICAgYXZhaWxhYmxlTW9udGhzID0gbW9udGhzT2ZZZWFyLm1hcCgobSwgaSkgPT4ge1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHtcbiAgICAgICAgbmFtZTogbVswXSxcbiAgICAgICAgYWJicmV2OiBtWzFdXG4gICAgICB9LCB7XG4gICAgICAgIHNlbGVjdGFibGU6XG4gICAgICAgICAgKCFpc09uTG93ZXJCb3VuZGFyeSAmJiAhaXNPblVwcGVyQm91bmRhcnkpXG4gICAgICAgICAgfHwgKFxuICAgICAgICAgICAgKCFpc09uTG93ZXJCb3VuZGFyeSB8fCBpID49IHN0YXJ0LmdldE1vbnRoKCkpXG4gICAgICAgICAgICAmJiAoIWlzT25VcHBlckJvdW5kYXJ5IHx8IGkgPD0gZW5kLmdldE1vbnRoKCkpXG4gICAgICAgICAgKVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB0b2dnbGVNb250aFNlbGVjdG9yT3BlbigpIHtcbiAgICBtb250aFNlbGVjdG9yT3BlbiA9ICFtb250aFNlbGVjdG9yT3BlbjtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1vbnRoU2VsZWN0ZWQoZXZlbnQsIHsgbSwgaSB9KSB7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgaWYgKCFtLnNlbGVjdGFibGUpIHJldHVybjtcbiAgICBkaXNwYXRjaCgnbW9udGhTZWxlY3RlZCcsIGkpO1xuICAgIHRvZ2dsZU1vbnRoU2VsZWN0b3JPcGVuKCk7XG4gIH1cbjwvc2NyaXB0PlxyXG5cclxuPGRpdiBjbGFzcz1cInRpdGxlXCI+XHJcbiAgPGRpdiBjbGFzcz1cImhlYWRpbmctc2VjdGlvblwiPlxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRyb2xcIiBcclxuICAgICAgY2xhc3M6ZW5hYmxlZD17Y2FuRGVjcmVtZW50TW9udGh9XHJcbiAgICAgIG9uOmNsaWNrPXsoKSA9PiBkaXNwYXRjaCgnaW5jcmVtZW50TW9udGgnLCAtMSl9PlxyXG4gICAgICA8aSBjbGFzcz1cImFycm93IGxlZnRcIj48L2k+XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJsYWJlbFwiIG9uOmNsaWNrPXt0b2dnbGVNb250aFNlbGVjdG9yT3Blbn0+XHJcbiAgICAgIHttb250aHNPZlllYXJbbW9udGhdWzBdfSB7eWVhcn1cclxuICAgIDwvZGl2PiBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250cm9sXCJcclxuICAgICAgY2xhc3M6ZW5hYmxlZD17Y2FuSW5jcmVtZW50TW9udGh9XHJcbiAgICAgIG9uOmNsaWNrPXsoKSA9PiBkaXNwYXRjaCgnaW5jcmVtZW50TW9udGgnLCAxKX0+XHJcbiAgICAgIDxpIGNsYXNzPVwiYXJyb3cgcmlnaHRcIj48L2k+XHJcbiAgICA8L2Rpdj5cclxuICA8L2Rpdj5cclxuICA8ZGl2IGNsYXNzPVwibW9udGgtc2VsZWN0b3JcIiBjbGFzczpvcGVuPXttb250aFNlbGVjdG9yT3Blbn0+XHJcbiAgICB7I2VhY2ggYXZhaWxhYmxlTW9udGhzIGFzIG1vbnRoRGVmaW5pdGlvbiwgaW5kZXh9XHJcbiAgICAgIDxkaXYgXHJcbiAgICAgICAgY2xhc3M9XCJtb250aC1zZWxlY3Rvci0tbW9udGhcIiBcclxuICAgICAgICBjbGFzczpzZWxlY3RlZD17aW5kZXggPT09IG1vbnRofVxyXG4gICAgICAgIGNsYXNzOnNlbGVjdGFibGU9e21vbnRoRGVmaW5pdGlvbi5zZWxlY3RhYmxlfVxyXG4gICAgICAgIG9uOmNsaWNrPXtlID0+IG1vbnRoU2VsZWN0ZWQoZSwgeyBtOiBtb250aERlZmluaXRpb24sIGk6IGluZGV4IH0pfVxyXG4gICAgICA+XHJcbiAgICAgICAgPHNwYW4+e21vbnRoRGVmaW5pdGlvbi5hYmJyZXZ9PC9zcGFuPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIHsvZWFjaH1cclxuICA8L2Rpdj5cclxuPC9kaXY+XHJcblxyXG48c3R5bGU+XHJcbiAgLmhlYWRpbmctc2VjdGlvbiB7IFxyXG4gICAgZm9udC1zaXplOiAyMHB4O1xyXG4gICAgcGFkZGluZzogMjRweCAxNXB4O1xyXG4gICAgZGlzcGxheTogZmxleDtcclxuICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcclxuICAgIGNvbG9yOiAjM2Q0NTQ4O1xyXG4gICAgZm9udC13ZWlnaHQ6IGJvbGQ7XHJcbiAgfVxyXG4gIC5sYWJlbCB7IFxyXG4gICAgY3Vyc29yOiBwb2ludGVyO1xyXG4gIH1cclxuICAubW9udGgtc2VsZWN0b3IgeyBcclxuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgIHRvcDogNzVweDsgXHJcbiAgICBsZWZ0OiAwOyBcclxuICAgIHJpZ2h0OiAwOyBcclxuICAgIGJvdHRvbTogMDsgXHJcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmO1xyXG4gICAgdHJhbnNpdGlvbjogYWxsIDMwMG1zOyBcclxuICAgIHRyYW5zZm9ybTogc2NhbGUoMS4yKTsgXHJcbiAgICBvcGFjaXR5OiAwOyBcclxuICAgIHZpc2liaWxpdHk6IGhpZGRlbjtcclxuICAgIHotaW5kZXg6IDE7XHJcbiAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XHJcbiAgfVxyXG4gIC5tb250aC1zZWxlY3Rvci5vcGVuIHsgXHJcbiAgICB0cmFuc2Zvcm06IHNjYWxlKDEpOyBcclxuICAgIHZpc2liaWxpdHk6IHZpc2libGU7XHJcbiAgICBvcGFjaXR5OiAxO1xyXG4gIH1cclxuICAubW9udGgtc2VsZWN0b3ItLW1vbnRoIHsgXHJcbiAgICB3aWR0aDogMzEuMzMzJTsgXHJcbiAgICBtYXJnaW46IC41JTsgXHJcbiAgICBoZWlnaHQ6IDIzJTtcclxuICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcclxuICAgIGNvbG9yOiAjNGE0YTRhO1xyXG4gICAgYm9yZGVyOiAxcHggc29saWQgI2VmZWZlZjtcclxuICAgIG9wYWNpdHk6IDAuMjtcclxuICB9XHJcbiAgLm1vbnRoLXNlbGVjdG9yLS1tb250aC5zZWxlY3RhYmxlIHsgXHJcbiAgICBvcGFjaXR5OiAxOyBcclxuICB9XHJcbiAgLm1vbnRoLXNlbGVjdG9yLS1tb250aC5zZWxlY3RhYmxlOmhvdmVyIHsgXHJcbiAgICBjdXJzb3I6IHBvaW50ZXI7XHJcbiAgICBib3gtc2hhZG93OiAwcHggMHB4IDNweCByZ2JhKDAsMCwwLDAuMTUpO1xyXG4gIH1cclxuICAubW9udGgtc2VsZWN0b3ItLW1vbnRoLnNlbGVjdGVkIHsgXHJcbiAgICBiYWNrZ3JvdW5kOiB2YXIoLS1oaWdobGlnaHQtY29sb3IpO1xyXG4gICAgY29sb3I6ICNmZmY7XHJcbiAgfVxyXG4gIC5tb250aC1zZWxlY3Rvci0tbW9udGg6YmVmb3JlIHsgXHJcbiAgICBjb250ZW50OiAnICc7XHJcbiAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XHJcbiAgICBoZWlnaHQ6IDEwMCU7XHJcbiAgICB2ZXJ0aWNhbC1hbGlnbjogbWlkZGxlO1xyXG4gIH1cclxuICAubW9udGgtc2VsZWN0b3ItLW1vbnRoIHNwYW4geyBcclxuICAgIHZlcnRpY2FsLWFsaWduOiBtaWRkbGU7IFxyXG4gICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xyXG4gIH1cclxuXHJcbiAgLmNvbnRyb2wgeyBcclxuICAgIHBhZGRpbmc6IDAgOHB4O1xyXG4gICAgb3BhY2l0eTogMC4yO1xyXG4gICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDNweCk7XHJcbiAgfVxyXG5cclxuICAuY29udHJvbC5lbmFibGVkIHsgXHJcbiAgICBvcGFjaXR5OiAxOyBcclxuICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICB9XHJcblxyXG4gIC5hcnJvdyB7XHJcbiAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XHJcbiAgICB3aWR0aDogMThweDtcclxuICAgIGhlaWdodDogMThweDtcclxuICAgIGJvcmRlci1zdHlsZTogc29saWQ7XHJcbiAgICBib3JkZXItY29sb3I6ICNhOWE5YTk7XHJcbiAgICBib3JkZXItd2lkdGg6IDA7XHJcbiAgICBib3JkZXItYm90dG9tLXdpZHRoOiAycHg7XHJcbiAgICBib3JkZXItcmlnaHQtd2lkdGg6IDJweDtcclxuICB9XHJcblxyXG4gIC5hcnJvdy5yaWdodCB7XHJcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgtNDVkZWcpO1xyXG4gICAgLXdlYmtpdC10cmFuc2Zvcm06IHJvdGF0ZSgtNDVkZWcpO1xyXG4gIH1cclxuXHJcbiAgLmFycm93LmxlZnQge1xyXG4gICAgdHJhbnNmb3JtOiByb3RhdGUoMTM1ZGVnKTtcclxuICAgIC13ZWJraXQtdHJhbnNmb3JtOiByb3RhdGUoMTM1ZGVnKTtcclxuICB9XHJcblxyXG48L3N0eWxlPlxyXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBNkVFLGdCQUFnQiw4QkFBQyxDQUFDLEFBQ2hCLFNBQVMsQ0FBRSxJQUFJLENBQ2YsT0FBTyxDQUFFLElBQUksQ0FBQyxJQUFJLENBQ2xCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsZUFBZSxDQUFFLGFBQWEsQ0FDOUIsS0FBSyxDQUFFLE9BQU8sQ0FDZCxXQUFXLENBQUUsSUFBSSxBQUNuQixDQUFDLEFBQ0QsTUFBTSw4QkFBQyxDQUFDLEFBQ04sTUFBTSxDQUFFLE9BQU8sQUFDakIsQ0FBQyxBQUNELGVBQWUsOEJBQUMsQ0FBQyxBQUNmLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLEdBQUcsQ0FBRSxJQUFJLENBQ1QsSUFBSSxDQUFFLENBQUMsQ0FDUCxLQUFLLENBQUUsQ0FBQyxDQUNSLE1BQU0sQ0FBRSxDQUFDLENBQ1QsZ0JBQWdCLENBQUUsSUFBSSxDQUN0QixVQUFVLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FDckIsU0FBUyxDQUFFLE1BQU0sR0FBRyxDQUFDLENBQ3JCLE9BQU8sQ0FBRSxDQUFDLENBQ1YsVUFBVSxDQUFFLE1BQU0sQ0FDbEIsT0FBTyxDQUFFLENBQUMsQ0FDVixVQUFVLENBQUUsTUFBTSxBQUNwQixDQUFDLEFBQ0QsZUFBZSxLQUFLLDhCQUFDLENBQUMsQUFDcEIsU0FBUyxDQUFFLE1BQU0sQ0FBQyxDQUFDLENBQ25CLFVBQVUsQ0FBRSxPQUFPLENBQ25CLE9BQU8sQ0FBRSxDQUFDLEFBQ1osQ0FBQyxBQUNELHNCQUFzQiw4QkFBQyxDQUFDLEFBQ3RCLEtBQUssQ0FBRSxPQUFPLENBQ2QsTUFBTSxDQUFFLEdBQUcsQ0FDWCxNQUFNLENBQUUsR0FBRyxDQUNYLE9BQU8sQ0FBRSxZQUFZLENBQ3JCLEtBQUssQ0FBRSxPQUFPLENBQ2QsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUN6QixPQUFPLENBQUUsR0FBRyxBQUNkLENBQUMsQUFDRCxzQkFBc0IsV0FBVyw4QkFBQyxDQUFDLEFBQ2pDLE9BQU8sQ0FBRSxDQUFDLEFBQ1osQ0FBQyxBQUNELHNCQUFzQix5Q0FBVyxNQUFNLEFBQUMsQ0FBQyxBQUN2QyxNQUFNLENBQUUsT0FBTyxDQUNmLFVBQVUsQ0FBRSxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxBQUMxQyxDQUFDLEFBQ0Qsc0JBQXNCLFNBQVMsOEJBQUMsQ0FBQyxBQUMvQixVQUFVLENBQUUsSUFBSSxpQkFBaUIsQ0FBQyxDQUNsQyxLQUFLLENBQUUsSUFBSSxBQUNiLENBQUMsQUFDRCxvREFBc0IsT0FBTyxBQUFDLENBQUMsQUFDN0IsT0FBTyxDQUFFLEdBQUcsQ0FDWixPQUFPLENBQUUsWUFBWSxDQUNyQixNQUFNLENBQUUsSUFBSSxDQUNaLGNBQWMsQ0FBRSxNQUFNLEFBQ3hCLENBQUMsQUFDRCxxQ0FBc0IsQ0FBQyxJQUFJLGVBQUMsQ0FBQyxBQUMzQixjQUFjLENBQUUsTUFBTSxDQUN0QixPQUFPLENBQUUsWUFBWSxBQUN2QixDQUFDLEFBRUQsUUFBUSw4QkFBQyxDQUFDLEFBQ1IsT0FBTyxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQ2QsT0FBTyxDQUFFLEdBQUcsQ0FDWixTQUFTLENBQUUsV0FBVyxHQUFHLENBQUMsQUFDNUIsQ0FBQyxBQUVELFFBQVEsUUFBUSw4QkFBQyxDQUFDLEFBQ2hCLE9BQU8sQ0FBRSxDQUFDLENBQ1YsTUFBTSxDQUFFLE9BQU8sQUFDakIsQ0FBQyxBQUVELE1BQU0sOEJBQUMsQ0FBQyxBQUNOLE9BQU8sQ0FBRSxZQUFZLENBQ3JCLEtBQUssQ0FBRSxJQUFJLENBQ1gsTUFBTSxDQUFFLElBQUksQ0FDWixZQUFZLENBQUUsS0FBSyxDQUNuQixZQUFZLENBQUUsT0FBTyxDQUNyQixZQUFZLENBQUUsQ0FBQyxDQUNmLG1CQUFtQixDQUFFLEdBQUcsQ0FDeEIsa0JBQWtCLENBQUUsR0FBRyxBQUN6QixDQUFDLEFBRUQsTUFBTSxNQUFNLDhCQUFDLENBQUMsQUFDWixTQUFTLENBQUUsT0FBTyxNQUFNLENBQUMsQ0FDekIsaUJBQWlCLENBQUUsT0FBTyxNQUFNLENBQUMsQUFDbkMsQ0FBQyxBQUVELE1BQU0sS0FBSyw4QkFBQyxDQUFDLEFBQ1gsU0FBUyxDQUFFLE9BQU8sTUFBTSxDQUFDLENBQ3pCLGlCQUFpQixDQUFFLE9BQU8sTUFBTSxDQUFDLEFBQ25DLENBQUMifQ== */";
    	append_dev(document.head, style);
    }

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	child_ctx[17] = i;
    	return child_ctx;
    }

    // (64:4) {#each availableMonths as monthDefinition, index}
    function create_each_block$2(ctx) {
    	let div;
    	let span;
    	let t0_value = /*monthDefinition*/ ctx[15].abbrev + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler_2(...args) {
    		return /*click_handler_2*/ ctx[14](/*monthDefinition*/ ctx[15], /*index*/ ctx[17], ...args);
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			attr_dev(span, "class", "svelte-1dqf106");
    			add_location(span, file$2, 70, 8, 1978);
    			attr_dev(div, "class", "month-selector--month svelte-1dqf106");
    			toggle_class(div, "selected", /*index*/ ctx[17] === /*month*/ ctx[0]);
    			toggle_class(div, "selectable", /*monthDefinition*/ ctx[15].selectable);
    			add_location(div, file$2, 64, 6, 1741);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, span);
    			append_dev(span, t0);
    			append_dev(div, t1);

    			if (!mounted) {
    				dispose = listen_dev(div, "click", click_handler_2, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*availableMonths*/ 64 && t0_value !== (t0_value = /*monthDefinition*/ ctx[15].abbrev + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*month*/ 1) {
    				toggle_class(div, "selected", /*index*/ ctx[17] === /*month*/ ctx[0]);
    			}

    			if (dirty & /*availableMonths*/ 64) {
    				toggle_class(div, "selectable", /*monthDefinition*/ ctx[15].selectable);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(64:4) {#each availableMonths as monthDefinition, index}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div5;
    	let div3;
    	let div0;
    	let i0;
    	let t0;
    	let div1;
    	let t1_value = /*monthsOfYear*/ ctx[4][/*month*/ ctx[0]][0] + "";
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let div2;
    	let i1;
    	let t5;
    	let div4;
    	let mounted;
    	let dispose;
    	let each_value = /*availableMonths*/ ctx[6];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div3 = element("div");
    			div0 = element("div");
    			i0 = element("i");
    			t0 = space();
    			div1 = element("div");
    			t1 = text(t1_value);
    			t2 = space();
    			t3 = text(/*year*/ ctx[1]);
    			t4 = space();
    			div2 = element("div");
    			i1 = element("i");
    			t5 = space();
    			div4 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(i0, "class", "arrow left svelte-1dqf106");
    			add_location(i0, file$2, 51, 6, 1286);
    			attr_dev(div0, "class", "control svelte-1dqf106");
    			toggle_class(div0, "enabled", /*canDecrementMonth*/ ctx[3]);
    			add_location(div0, file$2, 48, 4, 1160);
    			attr_dev(div1, "class", "label svelte-1dqf106");
    			add_location(div1, file$2, 53, 4, 1330);
    			attr_dev(i1, "class", "arrow right svelte-1dqf106");
    			add_location(i1, file$2, 59, 6, 1566);
    			attr_dev(div2, "class", "control svelte-1dqf106");
    			toggle_class(div2, "enabled", /*canIncrementMonth*/ ctx[2]);
    			add_location(div2, file$2, 56, 4, 1442);
    			attr_dev(div3, "class", "heading-section svelte-1dqf106");
    			add_location(div3, file$2, 47, 2, 1125);
    			attr_dev(div4, "class", "month-selector svelte-1dqf106");
    			toggle_class(div4, "open", /*monthSelectorOpen*/ ctx[5]);
    			add_location(div4, file$2, 62, 2, 1619);
    			attr_dev(div5, "class", "title");
    			add_location(div5, file$2, 46, 0, 1102);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div3);
    			append_dev(div3, div0);
    			append_dev(div0, i0);
    			append_dev(div3, t0);
    			append_dev(div3, div1);
    			append_dev(div1, t1);
    			append_dev(div1, t2);
    			append_dev(div1, t3);
    			append_dev(div3, t4);
    			append_dev(div3, div2);
    			append_dev(div2, i1);
    			append_dev(div5, t5);
    			append_dev(div5, div4);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div4, null);
    			}

    			if (!mounted) {
    				dispose = [
    					listen_dev(div0, "click", /*click_handler*/ ctx[12], false, false, false),
    					listen_dev(div1, "click", /*toggleMonthSelectorOpen*/ ctx[8], false, false, false),
    					listen_dev(div2, "click", /*click_handler_1*/ ctx[13], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*canDecrementMonth*/ 8) {
    				toggle_class(div0, "enabled", /*canDecrementMonth*/ ctx[3]);
    			}

    			if (dirty & /*monthsOfYear, month*/ 17 && t1_value !== (t1_value = /*monthsOfYear*/ ctx[4][/*month*/ ctx[0]][0] + "")) set_data_dev(t1, t1_value);
    			if (dirty & /*year*/ 2) set_data_dev(t3, /*year*/ ctx[1]);

    			if (dirty & /*canIncrementMonth*/ 4) {
    				toggle_class(div2, "enabled", /*canIncrementMonth*/ ctx[2]);
    			}

    			if (dirty & /*month, availableMonths, monthSelected*/ 577) {
    				each_value = /*availableMonths*/ ctx[6];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div4, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*monthSelectorOpen*/ 32) {
    				toggle_class(div4, "open", /*monthSelectorOpen*/ ctx[5]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { month } = $$props;
    	let { year } = $$props;
    	let { start } = $$props;
    	let { end } = $$props;
    	let { canIncrementMonth } = $$props;
    	let { canDecrementMonth } = $$props;
    	let { monthsOfYear } = $$props;
    	let monthSelectorOpen = false;
    	let availableMonths;

    	function toggleMonthSelectorOpen() {
    		$$invalidate(5, monthSelectorOpen = !monthSelectorOpen);
    	}

    	function monthSelected(event, { m, i }) {
    		event.stopPropagation();
    		if (!m.selectable) return;
    		dispatch("monthSelected", i);
    		toggleMonthSelectorOpen();
    	}

    	const writable_props = [
    		"month",
    		"year",
    		"start",
    		"end",
    		"canIncrementMonth",
    		"canDecrementMonth",
    		"monthsOfYear"
    	];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<NavBar> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("NavBar", $$slots, []);
    	const click_handler = () => dispatch("incrementMonth", -1);
    	const click_handler_1 = () => dispatch("incrementMonth", 1);
    	const click_handler_2 = (monthDefinition, index, e) => monthSelected(e, { m: monthDefinition, i: index });

    	$$self.$set = $$props => {
    		if ("month" in $$props) $$invalidate(0, month = $$props.month);
    		if ("year" in $$props) $$invalidate(1, year = $$props.year);
    		if ("start" in $$props) $$invalidate(10, start = $$props.start);
    		if ("end" in $$props) $$invalidate(11, end = $$props.end);
    		if ("canIncrementMonth" in $$props) $$invalidate(2, canIncrementMonth = $$props.canIncrementMonth);
    		if ("canDecrementMonth" in $$props) $$invalidate(3, canDecrementMonth = $$props.canDecrementMonth);
    		if ("monthsOfYear" in $$props) $$invalidate(4, monthsOfYear = $$props.monthsOfYear);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		month,
    		year,
    		start,
    		end,
    		canIncrementMonth,
    		canDecrementMonth,
    		monthsOfYear,
    		monthSelectorOpen,
    		availableMonths,
    		toggleMonthSelectorOpen,
    		monthSelected
    	});

    	$$self.$inject_state = $$props => {
    		if ("month" in $$props) $$invalidate(0, month = $$props.month);
    		if ("year" in $$props) $$invalidate(1, year = $$props.year);
    		if ("start" in $$props) $$invalidate(10, start = $$props.start);
    		if ("end" in $$props) $$invalidate(11, end = $$props.end);
    		if ("canIncrementMonth" in $$props) $$invalidate(2, canIncrementMonth = $$props.canIncrementMonth);
    		if ("canDecrementMonth" in $$props) $$invalidate(3, canDecrementMonth = $$props.canDecrementMonth);
    		if ("monthsOfYear" in $$props) $$invalidate(4, monthsOfYear = $$props.monthsOfYear);
    		if ("monthSelectorOpen" in $$props) $$invalidate(5, monthSelectorOpen = $$props.monthSelectorOpen);
    		if ("availableMonths" in $$props) $$invalidate(6, availableMonths = $$props.availableMonths);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*start, year, end, monthsOfYear*/ 3090) {
    			 {
    				let isOnLowerBoundary = start.getFullYear() === year;
    				let isOnUpperBoundary = end.getFullYear() === year;

    				$$invalidate(6, availableMonths = monthsOfYear.map((m, i) => {
    					return Object.assign({}, { name: m[0], abbrev: m[1] }, {
    						selectable: !isOnLowerBoundary && !isOnUpperBoundary || (!isOnLowerBoundary || i >= start.getMonth()) && (!isOnUpperBoundary || i <= end.getMonth())
    					});
    				}));
    			}
    		}
    	};

    	return [
    		month,
    		year,
    		canIncrementMonth,
    		canDecrementMonth,
    		monthsOfYear,
    		monthSelectorOpen,
    		availableMonths,
    		dispatch,
    		toggleMonthSelectorOpen,
    		monthSelected,
    		start,
    		end,
    		click_handler,
    		click_handler_1,
    		click_handler_2
    	];
    }

    class NavBar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1dqf106-style")) add_css$2();

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			month: 0,
    			year: 1,
    			start: 10,
    			end: 11,
    			canIncrementMonth: 2,
    			canDecrementMonth: 3,
    			monthsOfYear: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "NavBar",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*month*/ ctx[0] === undefined && !("month" in props)) {
    			console.warn("<NavBar> was created without expected prop 'month'");
    		}

    		if (/*year*/ ctx[1] === undefined && !("year" in props)) {
    			console.warn("<NavBar> was created without expected prop 'year'");
    		}

    		if (/*start*/ ctx[10] === undefined && !("start" in props)) {
    			console.warn("<NavBar> was created without expected prop 'start'");
    		}

    		if (/*end*/ ctx[11] === undefined && !("end" in props)) {
    			console.warn("<NavBar> was created without expected prop 'end'");
    		}

    		if (/*canIncrementMonth*/ ctx[2] === undefined && !("canIncrementMonth" in props)) {
    			console.warn("<NavBar> was created without expected prop 'canIncrementMonth'");
    		}

    		if (/*canDecrementMonth*/ ctx[3] === undefined && !("canDecrementMonth" in props)) {
    			console.warn("<NavBar> was created without expected prop 'canDecrementMonth'");
    		}

    		if (/*monthsOfYear*/ ctx[4] === undefined && !("monthsOfYear" in props)) {
    			console.warn("<NavBar> was created without expected prop 'monthsOfYear'");
    		}
    	}

    	get month() {
    		throw new Error("<NavBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set month(value) {
    		throw new Error("<NavBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get year() {
    		throw new Error("<NavBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set year(value) {
    		throw new Error("<NavBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get start() {
    		throw new Error("<NavBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set start(value) {
    		throw new Error("<NavBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get end() {
    		throw new Error("<NavBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set end(value) {
    		throw new Error("<NavBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get canIncrementMonth() {
    		throw new Error("<NavBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set canIncrementMonth(value) {
    		throw new Error("<NavBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get canDecrementMonth() {
    		throw new Error("<NavBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set canDecrementMonth(value) {
    		throw new Error("<NavBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get monthsOfYear() {
    		throw new Error("<NavBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set monthsOfYear(value) {
    		throw new Error("<NavBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/svelte/components/calendar/Popover.svelte generated by Svelte v3.24.0 */

    const { document: document_1, window: window_1 } = globals;
    const file$3 = "src/svelte/components/calendar/Popover.svelte";

    function add_css$3() {
    	var style = element("style");
    	style.id = "svelte-mc1z8c-style";
    	style.textContent = ".sc-popover.svelte-mc1z8c.svelte-mc1z8c{position:relative}.contents-wrapper.svelte-mc1z8c.svelte-mc1z8c{transform:translate(-50%, -50%);position:absolute;top:50%;left:50%;transition:none;z-index:2;display:none}.contents.svelte-mc1z8c.svelte-mc1z8c{background:#fff;box-shadow:0px 10px 26px rgba(0,0,0,0.4) ;opacity:.8;padding-top:0;display:none;animation:svelte-mc1z8c-grow 200ms forwards cubic-bezier(.92,.09,.18,1.05)}.contents-inner.svelte-mc1z8c.svelte-mc1z8c{animation:svelte-mc1z8c-fadeIn 400ms forwards}.contents-wrapper.visible.svelte-mc1z8c.svelte-mc1z8c{display:block}.contents-wrapper.visible.svelte-mc1z8c .contents.svelte-mc1z8c{opacity:1;transform:scale(1);display:block}.contents-wrapper.shrink.svelte-mc1z8c .contents.svelte-mc1z8c{animation:svelte-mc1z8c-shrink 150ms forwards cubic-bezier(.92,.09,.18,1.05)}@keyframes svelte-mc1z8c-grow{0%{transform:scale(.9,.1);opacity:0}30%{opacity:1}100%{transform:scale(1)}}@keyframes svelte-mc1z8c-shrink{0%{transform:scale(1);opacity:1}70%{opacity:1}100%{opacity:0;transform:scale(.9,.1)}}@keyframes svelte-mc1z8c-fadeIn{0%{opacity:0}50%{opacity:0}100%{opacity:1}}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9wb3Zlci5zdmVsdGUiLCJzb3VyY2VzIjpbIlBvcG92ZXIuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGltcG9ydCB7IG9uTW91bnQsIGNyZWF0ZUV2ZW50RGlzcGF0Y2hlciwgdGljayB9IGZyb20gJ3N2ZWx0ZSc7XG5cbiAgY29uc3QgZGlzcGF0Y2ggPSBjcmVhdGVFdmVudERpc3BhdGNoZXIoKTtcblxuICBsZXQgb25jZSA9IChlbCwgZXZ0LCBjYikgPT4ge1xuICAgIGZ1bmN0aW9uIGhhbmRsZXIoKSB7XG4gICAgICBjYi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldnQsIGhhbmRsZXIpO1xuICAgIH1cbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2dCwgaGFuZGxlcik7XG4gIH07XG5cbiAgbGV0IHBvcG92ZXI7XG4gIGxldCB3O1xuICBsZXQgdHJpZ2dlckNvbnRhaW5lcjtcbiAgbGV0IGNvbnRlbnRzQW5pbWF0ZWQ7XG4gIGxldCBjb250ZW50c1dyYXBwZXI7XG4gIGxldCB0cmFuc2xhdGVZID0gMDtcbiAgbGV0IHRyYW5zbGF0ZVggPSAwO1xuXG4gIGV4cG9ydCBsZXQgb3BlbiA9IGZhbHNlO1xuICBleHBvcnQgbGV0IHNocmluaztcbiAgZXhwb3J0IGxldCB0cmlnZ2VyO1xuICBleHBvcnQgY29uc3QgY2xvc2UgPSAoKSA9PiB7XG4gICAgc2hyaW5rID0gdHJ1ZTtcbiAgICBvbmNlKGNvbnRlbnRzQW5pbWF0ZWQsICdhbmltYXRpb25lbmQnLCAoKSA9PiB7XG4gICAgICBzaHJpbmsgPSBmYWxzZTtcbiAgICAgIG9wZW4gPSBmYWxzZTtcbiAgICAgIGRpc3BhdGNoKCdjbG9zZWQnKTtcbiAgICB9KTtcbiAgfTtcblxuICBmdW5jdGlvbiBjaGVja0ZvckZvY3VzTG9zcyhldnQpIHtcbiAgICBpZiAoIW9wZW4pIHJldHVybjtcbiAgICBsZXQgZWwgPSBldnQudGFyZ2V0O1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZVxuICAgIGRvIHtcclxuICAgICAgaWYgKGVsID09PSBwb3BvdmVyKSByZXR1cm47XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lXG4gICAgfSB3aGlsZSAoZWwgPSBlbC5wYXJlbnROb2RlKTtcclxuICAgIGNsb3NlKCk7XG4gIH1cblxuICBvbk1vdW50KCgpID0+IHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNoZWNrRm9yRm9jdXNMb3NzKTtcbiAgICBpZiAoIXRyaWdnZXIpIHJldHVybjtcbiAgICB0cmlnZ2VyQ29udGFpbmVyLmFwcGVuZENoaWxkKHRyaWdnZXIucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0cmlnZ2VyKSk7XG5cbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmVcbiAgICByZXR1cm4gKCkgPT4ge1xyXG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycsIGNoZWNrRm9yRm9jdXNMb3NzKTtcbiAgICB9O1xuICB9KTtcblxuICBjb25zdCBnZXREaXN0YW5jZVRvRWRnZXMgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKCFvcGVuKSB7IG9wZW4gPSB0cnVlOyB9XG4gICAgYXdhaXQgdGljaygpO1xuICAgIGxldCByZWN0ID0gY29udGVudHNXcmFwcGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHJldHVybiB7XG4gICAgICB0b3A6IHJlY3QudG9wICsgKC0xICogdHJhbnNsYXRlWSksXG4gICAgICBib3R0b206IHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuYm90dG9tICsgdHJhbnNsYXRlWSxcbiAgICAgIGxlZnQ6IHJlY3QubGVmdCArICgtMSAqIHRyYW5zbGF0ZVgpLFxuICAgICAgcmlnaHQ6IGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGggLSByZWN0LnJpZ2h0ICsgdHJhbnNsYXRlWFxuICAgIH07XG4gIH07XG5cbiAgY29uc3QgZ2V0VHJhbnNsYXRlID0gYXN5bmMgKCkgPT4ge1xuICAgIGxldCBkaXN0ID0gYXdhaXQgZ2V0RGlzdGFuY2VUb0VkZ2VzKCk7XG4gICAgbGV0IHg7IGxldFxuICAgICAgeTtcbiAgICBpZiAodyA8IDQ4MCkge1xuICAgICAgeSA9IGRpc3QuYm90dG9tO1xuICAgIH0gZWxzZSBpZiAoZGlzdC50b3AgPCAwKSB7XG4gICAgICB5ID0gTWF0aC5hYnMoZGlzdC50b3ApO1xuICAgIH0gZWxzZSBpZiAoZGlzdC5ib3R0b20gPCAwKSB7XG4gICAgICB5ID0gZGlzdC5ib3R0b207XG4gICAgfSBlbHNlIHtcbiAgICAgIHkgPSAwO1xuICAgIH1cbiAgICBpZiAoZGlzdC5sZWZ0IDwgMCkge1xuICAgICAgeCA9IE1hdGguYWJzKGRpc3QubGVmdCk7XG4gICAgfSBlbHNlIGlmIChkaXN0LnJpZ2h0IDwgMCkge1xuICAgICAgeCA9IGRpc3QucmlnaHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHggPSAwO1xuICAgIH1cbiAgICByZXR1cm4geyB4LCB5IH07XG4gIH07XG5cbiAgY29uc3QgZG9PcGVuID0gYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IHsgeCwgeSB9ID0gYXdhaXQgZ2V0VHJhbnNsYXRlKCk7XG5cbiAgICB0cmFuc2xhdGVYID0geDtcbiAgICB0cmFuc2xhdGVZID0geTtcbiAgICBvcGVuID0gdHJ1ZTtcblxuICAgIGRpc3BhdGNoKCdvcGVuZWQnKTtcbiAgfTtcbjwvc2NyaXB0PlxyXG5cclxuPHN2ZWx0ZTp3aW5kb3cgYmluZDppbm5lcldpZHRoPXt3fSAvPlxyXG48ZGl2IGNsYXNzPVwic2MtcG9wb3ZlclwiIGJpbmQ6dGhpcz17cG9wb3Zlcn0+XHJcbiAgPGRpdiBjbGFzcz1cInRyaWdnZXJcIiBvbjpjbGljaz17ZG9PcGVufSBiaW5kOnRoaXM9e3RyaWdnZXJDb250YWluZXJ9PlxyXG4gICAgPHNsb3QgbmFtZT1cInRyaWdnZXJcIj5cclxuICAgIDwvc2xvdD5cclxuICA8L2Rpdj5cclxuICA8ZGl2IFxyXG4gICAgY2xhc3M9XCJjb250ZW50cy13cmFwcGVyXCIgXHJcbiAgICBjbGFzczp2aXNpYmxlPXtvcGVufVxyXG4gICAgY2xhc3M6c2hyaW5rPXtzaHJpbmt9XHJcbiAgICBzdHlsZT1cInRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsLTUwJSkgdHJhbnNsYXRlKHt0cmFuc2xhdGVYfXB4LCB7dHJhbnNsYXRlWX1weClcIiBcclxuICAgIGJpbmQ6dGhpcz17Y29udGVudHNXcmFwcGVyfT5cclxuICAgIDxkaXYgY2xhc3M9XCJjb250ZW50c1wiIGJpbmQ6dGhpcz17Y29udGVudHNBbmltYXRlZH0+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJjb250ZW50cy1pbm5lclwiPlxyXG4gICAgICAgIDxzbG90IG5hbWU9XCJjb250ZW50c1wiPjwvc2xvdD5cclxuICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuICA8L2Rpdj5cclxuPC9kaXY+XHJcblxyXG48c3R5bGU+XHJcbiAgLnNjLXBvcG92ZXIgeyBcclxuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcclxuICB9XHJcblxyXG4gIC5jb250ZW50cy13cmFwcGVyIHsgXHJcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLCAtNTAlKTsgXHJcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XHJcbiAgICB0b3A6IDUwJTsgXHJcbiAgICBsZWZ0OiA1MCU7IFxyXG4gICAgdHJhbnNpdGlvbjogbm9uZTtcclxuICAgIHotaW5kZXg6IDI7XHJcbiAgICBkaXNwbGF5OiBub25lO1xyXG4gIH1cclxuXHJcbiAgLmNvbnRlbnRzIHsgXHJcbiAgICBiYWNrZ3JvdW5kOiAjZmZmO1xyXG4gICAgYm94LXNoYWRvdzogMHB4IDEwcHggMjZweCByZ2JhKDAsMCwwLDAuNCkgO1xyXG4gICAgb3BhY2l0eTogLjg7IFxyXG4gICAgcGFkZGluZy10b3A6IDA7XHJcbiAgICBkaXNwbGF5OiBub25lO1xyXG4gICAgYW5pbWF0aW9uOiBncm93IDIwMG1zIGZvcndhcmRzIGN1YmljLWJlemllciguOTIsLjA5LC4xOCwxLjA1KTtcclxuICB9XHJcblxyXG4gIC5jb250ZW50cy1pbm5lciB7IFxyXG4gICAgYW5pbWF0aW9uOiBmYWRlSW4gNDAwbXMgZm9yd2FyZHM7XHJcbiAgfVxyXG5cclxuICAuY29udGVudHMtd3JhcHBlci52aXNpYmxlIHsgXHJcbiAgICBkaXNwbGF5OiBibG9jaztcclxuICB9XHJcblxyXG4gIC5jb250ZW50cy13cmFwcGVyLnZpc2libGUgLmNvbnRlbnRzIHsgXHJcbiAgICBvcGFjaXR5OiAxOyBcclxuICAgIHRyYW5zZm9ybTogc2NhbGUoMSk7XHJcbiAgICBkaXNwbGF5OiBibG9jaztcclxuICB9XHJcblxyXG4gIC5jb250ZW50cy13cmFwcGVyLnNocmluayAuY29udGVudHMgeyBcclxuICAgIGFuaW1hdGlvbjogc2hyaW5rIDE1MG1zIGZvcndhcmRzIGN1YmljLWJlemllciguOTIsLjA5LC4xOCwxLjA1KTtcclxuICB9XHJcblxyXG4gIEBrZXlmcmFtZXMgZ3JvdyB7IFxyXG4gICAgMCUgeyBcclxuICAgICAgdHJhbnNmb3JtOiBzY2FsZSguOSwuMSk7IFxyXG4gICAgICBvcGFjaXR5OiAwOyBcclxuICAgIH1cclxuICAgIDMwJSB7IFxyXG4gICAgICBvcGFjaXR5OiAxOyBcclxuICAgIH1cclxuICAgIDEwMCUgeyBcclxuICAgICAgdHJhbnNmb3JtOiBzY2FsZSgxKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIEBrZXlmcmFtZXMgc2hyaW5rIHsgXHJcbiAgICAwJSB7IFxyXG4gICAgICB0cmFuc2Zvcm06IHNjYWxlKDEpOyBcclxuICAgICAgb3BhY2l0eTogMTsgXHJcbiAgICB9XHJcbiAgICA3MCUgeyBcclxuICAgICAgb3BhY2l0eTogMTsgXHJcbiAgICB9XHJcbiAgICAxMDAlIHsgXHJcbiAgICAgIG9wYWNpdHk6IDA7IFxyXG4gICAgICB0cmFuc2Zvcm06IHNjYWxlKC45LC4xKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIEBrZXlmcmFtZXMgZmFkZUluIHsgXHJcbiAgICAwJSB7IFxyXG4gICAgICBvcGFjaXR5OiAwOyBcclxuICAgIH1cclxuICAgIDUwJSB7IFxyXG4gICAgICBvcGFjaXR5OiAwO1xyXG4gICAgfVxyXG4gICAgMTAwJSB7IFxyXG4gICAgICBvcGFjaXR5OiAxOyBcclxuICAgIH1cclxuICB9XHJcbjwvc3R5bGU+XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUEwSEUsV0FBVyw0QkFBQyxDQUFDLEFBQ1gsUUFBUSxDQUFFLFFBQVEsQUFDcEIsQ0FBQyxBQUVELGlCQUFpQiw0QkFBQyxDQUFDLEFBQ2pCLFNBQVMsQ0FBRSxVQUFVLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUNoQyxRQUFRLENBQUUsUUFBUSxDQUNsQixHQUFHLENBQUUsR0FBRyxDQUNSLElBQUksQ0FBRSxHQUFHLENBQ1QsVUFBVSxDQUFFLElBQUksQ0FDaEIsT0FBTyxDQUFFLENBQUMsQ0FDVixPQUFPLENBQUUsSUFBSSxBQUNmLENBQUMsQUFFRCxTQUFTLDRCQUFDLENBQUMsQUFDVCxVQUFVLENBQUUsSUFBSSxDQUNoQixVQUFVLENBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUMxQyxPQUFPLENBQUUsRUFBRSxDQUNYLFdBQVcsQ0FBRSxDQUFDLENBQ2QsT0FBTyxDQUFFLElBQUksQ0FDYixTQUFTLENBQUUsa0JBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEFBQy9ELENBQUMsQUFFRCxlQUFlLDRCQUFDLENBQUMsQUFDZixTQUFTLENBQUUsb0JBQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxBQUNsQyxDQUFDLEFBRUQsaUJBQWlCLFFBQVEsNEJBQUMsQ0FBQyxBQUN6QixPQUFPLENBQUUsS0FBSyxBQUNoQixDQUFDLEFBRUQsaUJBQWlCLHNCQUFRLENBQUMsU0FBUyxjQUFDLENBQUMsQUFDbkMsT0FBTyxDQUFFLENBQUMsQ0FDVixTQUFTLENBQUUsTUFBTSxDQUFDLENBQUMsQ0FDbkIsT0FBTyxDQUFFLEtBQUssQUFDaEIsQ0FBQyxBQUVELGlCQUFpQixxQkFBTyxDQUFDLFNBQVMsY0FBQyxDQUFDLEFBQ2xDLFNBQVMsQ0FBRSxvQkFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsYUFBYSxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQUFDakUsQ0FBQyxBQUVELFdBQVcsa0JBQUssQ0FBQyxBQUNmLEVBQUUsQUFBQyxDQUFDLEFBQ0YsU0FBUyxDQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUN2QixPQUFPLENBQUUsQ0FBQyxBQUNaLENBQUMsQUFDRCxHQUFHLEFBQUMsQ0FBQyxBQUNILE9BQU8sQ0FBRSxDQUFDLEFBQ1osQ0FBQyxBQUNELElBQUksQUFBQyxDQUFDLEFBQ0osU0FBUyxDQUFFLE1BQU0sQ0FBQyxDQUFDLEFBQ3JCLENBQUMsQUFDSCxDQUFDLEFBRUQsV0FBVyxvQkFBTyxDQUFDLEFBQ2pCLEVBQUUsQUFBQyxDQUFDLEFBQ0YsU0FBUyxDQUFFLE1BQU0sQ0FBQyxDQUFDLENBQ25CLE9BQU8sQ0FBRSxDQUFDLEFBQ1osQ0FBQyxBQUNELEdBQUcsQUFBQyxDQUFDLEFBQ0gsT0FBTyxDQUFFLENBQUMsQUFDWixDQUFDLEFBQ0QsSUFBSSxBQUFDLENBQUMsQUFDSixPQUFPLENBQUUsQ0FBQyxDQUNWLFNBQVMsQ0FBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQUFDekIsQ0FBQyxBQUNILENBQUMsQUFFRCxXQUFXLG9CQUFPLENBQUMsQUFDakIsRUFBRSxBQUFDLENBQUMsQUFDRixPQUFPLENBQUUsQ0FBQyxBQUNaLENBQUMsQUFDRCxHQUFHLEFBQUMsQ0FBQyxBQUNILE9BQU8sQ0FBRSxDQUFDLEFBQ1osQ0FBQyxBQUNELElBQUksQUFBQyxDQUFDLEFBQ0osT0FBTyxDQUFFLENBQUMsQUFDWixDQUFDLEFBQ0gsQ0FBQyJ9 */";
    	append_dev(document_1.head, style);
    }

    const get_contents_slot_changes = dirty => ({});
    const get_contents_slot_context = ctx => ({});
    const get_trigger_slot_changes = dirty => ({});
    const get_trigger_slot_context = ctx => ({});

    function create_fragment$3(ctx) {
    	let div4;
    	let div0;
    	let t;
    	let div3;
    	let div2;
    	let div1;
    	let current;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowresize*/ ctx[14]);
    	const trigger_slot_template = /*$$slots*/ ctx[13].trigger;
    	const trigger_slot = create_slot(trigger_slot_template, ctx, /*$$scope*/ ctx[12], get_trigger_slot_context);
    	const contents_slot_template = /*$$slots*/ ctx[13].contents;
    	const contents_slot = create_slot(contents_slot_template, ctx, /*$$scope*/ ctx[12], get_contents_slot_context);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div0 = element("div");
    			if (trigger_slot) trigger_slot.c();
    			t = space();
    			div3 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			if (contents_slot) contents_slot.c();
    			attr_dev(div0, "class", "trigger");
    			add_location(div0, file$3, 103, 2, 2365);
    			attr_dev(div1, "class", "contents-inner svelte-mc1z8c");
    			add_location(div1, file$3, 114, 6, 2763);
    			attr_dev(div2, "class", "contents svelte-mc1z8c");
    			add_location(div2, file$3, 113, 4, 2704);
    			attr_dev(div3, "class", "contents-wrapper svelte-mc1z8c");
    			set_style(div3, "transform", "translate(-50%,-50%) translate(" + /*translateX*/ ctx[8] + "px, " + /*translateY*/ ctx[7] + "px)");
    			toggle_class(div3, "visible", /*open*/ ctx[0]);
    			toggle_class(div3, "shrink", /*shrink*/ ctx[1]);
    			add_location(div3, file$3, 107, 2, 2487);
    			attr_dev(div4, "class", "sc-popover svelte-mc1z8c");
    			add_location(div4, file$3, 102, 0, 2317);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div0);

    			if (trigger_slot) {
    				trigger_slot.m(div0, null);
    			}

    			/*div0_binding*/ ctx[15](div0);
    			append_dev(div4, t);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div2, div1);

    			if (contents_slot) {
    				contents_slot.m(div1, null);
    			}

    			/*div2_binding*/ ctx[16](div2);
    			/*div3_binding*/ ctx[17](div3);
    			/*div4_binding*/ ctx[18](div4);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(window_1, "resize", /*onwindowresize*/ ctx[14]),
    					listen_dev(div0, "click", /*doOpen*/ ctx[9], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (trigger_slot) {
    				if (trigger_slot.p && dirty & /*$$scope*/ 4096) {
    					update_slot(trigger_slot, trigger_slot_template, ctx, /*$$scope*/ ctx[12], dirty, get_trigger_slot_changes, get_trigger_slot_context);
    				}
    			}

    			if (contents_slot) {
    				if (contents_slot.p && dirty & /*$$scope*/ 4096) {
    					update_slot(contents_slot, contents_slot_template, ctx, /*$$scope*/ ctx[12], dirty, get_contents_slot_changes, get_contents_slot_context);
    				}
    			}

    			if (!current || dirty & /*translateX, translateY*/ 384) {
    				set_style(div3, "transform", "translate(-50%,-50%) translate(" + /*translateX*/ ctx[8] + "px, " + /*translateY*/ ctx[7] + "px)");
    			}

    			if (dirty & /*open*/ 1) {
    				toggle_class(div3, "visible", /*open*/ ctx[0]);
    			}

    			if (dirty & /*shrink*/ 2) {
    				toggle_class(div3, "shrink", /*shrink*/ ctx[1]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(trigger_slot, local);
    			transition_in(contents_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(trigger_slot, local);
    			transition_out(contents_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			if (trigger_slot) trigger_slot.d(detaching);
    			/*div0_binding*/ ctx[15](null);
    			if (contents_slot) contents_slot.d(detaching);
    			/*div2_binding*/ ctx[16](null);
    			/*div3_binding*/ ctx[17](null);
    			/*div4_binding*/ ctx[18](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();

    	let once = (el, evt, cb) => {
    		function handler() {
    			cb.apply(this, arguments);
    			el.removeEventListener(evt, handler);
    		}

    		el.addEventListener(evt, handler);
    	};

    	let popover;
    	let w;
    	let triggerContainer;
    	let contentsAnimated;
    	let contentsWrapper;
    	let translateY = 0;
    	let translateX = 0;
    	let { open = false } = $$props;
    	let { shrink } = $$props;
    	let { trigger } = $$props;

    	const close = () => {
    		$$invalidate(1, shrink = true);

    		once(contentsAnimated, "animationend", () => {
    			$$invalidate(1, shrink = false);
    			$$invalidate(0, open = false);
    			dispatch("closed");
    		});
    	};

    	function checkForFocusLoss(evt) {
    		if (!open) return;
    		let el = evt.target;

    		// eslint-disable-next-line
    		do {
    			if (el === popover) return;
    		} while (el = el.parentNode); // eslint-disable-next-line

    		close();
    	}

    	onMount(() => {
    		document.addEventListener("click", checkForFocusLoss);
    		if (!trigger) return;
    		triggerContainer.appendChild(trigger.parentNode.removeChild(trigger));

    		// eslint-disable-next-line
    		return () => {
    			document.removeEventListener("click", checkForFocusLoss);
    		};
    	});

    	const getDistanceToEdges = async () => {
    		if (!open) {
    			$$invalidate(0, open = true);
    		}

    		await tick();
    		let rect = contentsWrapper.getBoundingClientRect();

    		return {
    			top: rect.top + -1 * translateY,
    			bottom: window.innerHeight - rect.bottom + translateY,
    			left: rect.left + -1 * translateX,
    			right: document.body.clientWidth - rect.right + translateX
    		};
    	};

    	const getTranslate = async () => {
    		let dist = await getDistanceToEdges();
    		let x;
    		let y;

    		if (w < 480) {
    			y = dist.bottom;
    		} else if (dist.top < 0) {
    			y = Math.abs(dist.top);
    		} else if (dist.bottom < 0) {
    			y = dist.bottom;
    		} else {
    			y = 0;
    		}

    		if (dist.left < 0) {
    			x = Math.abs(dist.left);
    		} else if (dist.right < 0) {
    			x = dist.right;
    		} else {
    			x = 0;
    		}

    		return { x, y };
    	};

    	const doOpen = async () => {
    		const { x, y } = await getTranslate();
    		$$invalidate(8, translateX = x);
    		$$invalidate(7, translateY = y);
    		$$invalidate(0, open = true);
    		dispatch("opened");
    	};

    	const writable_props = ["open", "shrink", "trigger"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Popover> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Popover", $$slots, ['trigger','contents']);

    	function onwindowresize() {
    		$$invalidate(3, w = window_1.innerWidth);
    	}

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			triggerContainer = $$value;
    			$$invalidate(4, triggerContainer);
    		});
    	}

    	function div2_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			contentsAnimated = $$value;
    			$$invalidate(5, contentsAnimated);
    		});
    	}

    	function div3_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			contentsWrapper = $$value;
    			$$invalidate(6, contentsWrapper);
    		});
    	}

    	function div4_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			popover = $$value;
    			$$invalidate(2, popover);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("open" in $$props) $$invalidate(0, open = $$props.open);
    		if ("shrink" in $$props) $$invalidate(1, shrink = $$props.shrink);
    		if ("trigger" in $$props) $$invalidate(10, trigger = $$props.trigger);
    		if ("$$scope" in $$props) $$invalidate(12, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		createEventDispatcher,
    		tick,
    		dispatch,
    		once,
    		popover,
    		w,
    		triggerContainer,
    		contentsAnimated,
    		contentsWrapper,
    		translateY,
    		translateX,
    		open,
    		shrink,
    		trigger,
    		close,
    		checkForFocusLoss,
    		getDistanceToEdges,
    		getTranslate,
    		doOpen
    	});

    	$$self.$inject_state = $$props => {
    		if ("once" in $$props) once = $$props.once;
    		if ("popover" in $$props) $$invalidate(2, popover = $$props.popover);
    		if ("w" in $$props) $$invalidate(3, w = $$props.w);
    		if ("triggerContainer" in $$props) $$invalidate(4, triggerContainer = $$props.triggerContainer);
    		if ("contentsAnimated" in $$props) $$invalidate(5, contentsAnimated = $$props.contentsAnimated);
    		if ("contentsWrapper" in $$props) $$invalidate(6, contentsWrapper = $$props.contentsWrapper);
    		if ("translateY" in $$props) $$invalidate(7, translateY = $$props.translateY);
    		if ("translateX" in $$props) $$invalidate(8, translateX = $$props.translateX);
    		if ("open" in $$props) $$invalidate(0, open = $$props.open);
    		if ("shrink" in $$props) $$invalidate(1, shrink = $$props.shrink);
    		if ("trigger" in $$props) $$invalidate(10, trigger = $$props.trigger);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		open,
    		shrink,
    		popover,
    		w,
    		triggerContainer,
    		contentsAnimated,
    		contentsWrapper,
    		translateY,
    		translateX,
    		doOpen,
    		trigger,
    		close,
    		$$scope,
    		$$slots,
    		onwindowresize,
    		div0_binding,
    		div2_binding,
    		div3_binding,
    		div4_binding
    	];
    }

    class Popover extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document_1.getElementById("svelte-mc1z8c-style")) add_css$3();

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			open: 0,
    			shrink: 1,
    			trigger: 10,
    			close: 11
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Popover",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*shrink*/ ctx[1] === undefined && !("shrink" in props)) {
    			console.warn("<Popover> was created without expected prop 'shrink'");
    		}

    		if (/*trigger*/ ctx[10] === undefined && !("trigger" in props)) {
    			console.warn("<Popover> was created without expected prop 'trigger'");
    		}
    	}

    	get open() {
    		throw new Error("<Popover>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set open(value) {
    		throw new Error("<Popover>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get shrink() {
    		throw new Error("<Popover>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set shrink(value) {
    		throw new Error("<Popover>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get trigger() {
    		throw new Error("<Popover>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set trigger(value) {
    		throw new Error("<Popover>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get close() {
    		return this.$$.ctx[11];
    	}

    	set close(value) {
    		throw new Error("<Popover>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /**
     * generic function to inject data into token-laden string
     * @param str {String} Required
     * @param name {String} Required
     * @param value {String|Integer} Required
     * @returns {String}
     *
     * @example
     * injectStringData("The following is a token: #{tokenName}", "tokenName", 123); 
     * @returns {String} "The following is a token: 123"
     *
     */
    const injectStringData = (str,name,value) => str
      .replace(new RegExp('#{'+name+'}','g'), value);

    /**
     * Generic function to enforce length of string. 
     * 
     * Pass a string or number to this function and specify the desired length.
     * This function will either pad the # with leading 0's (if str.length < length)
     * or remove data from the end (@fromBack==false) or beginning (@fromBack==true)
     * of the string when str.length > length.
     *
     * When length == str.length or typeof length == 'undefined', this function
     * returns the original @str parameter.
     * 
     * @param str {String} Required
     * @param length {Integer} Required
     * @param fromBack {Boolean} Optional
     * @returns {String}
     *
     */
    const enforceLength = function(str,length,fromBack) {
      str = str.toString();
      if(typeof length == 'undefined') return str;
      if(str.length == length) return str;
      fromBack = (typeof fromBack == 'undefined') ? false : fromBack;
      if(str.length < length) {
        // pad the beginning of the string w/ enough 0's to reach desired length:
        while(length - str.length > 0) str = '0' + str;
      } else if(str.length > length) {
        if(fromBack) {
          // grab the desired #/chars from end of string: ex: '2015' -> '15'
          str = str.substring(str.length-length);
        } else {
          // grab the desired #/chars from beginning of string: ex: '2015' -> '20'
          str = str.substring(0,length);
        }
      }
      return str;
    };

    const daysOfWeek = [ 
      [ 'Sunday', 'Sun' ],
      [ 'Monday', 'Mon' ],
      [ 'Tuesday', 'Tue' ],
      [ 'Wednesday', 'Wed' ],
      [ 'Thursday', 'Thu' ],
      [ 'Friday', 'Fri' ],
      [ 'Saturday', 'Sat' ]
    ];

    const monthsOfYear = [ 
      [ 'January', 'Jan' ],
      [ 'February', 'Feb' ],
      [ 'March', 'Mar' ],
      [ 'April', 'Apr' ],
      [ 'May', 'May' ],
      [ 'June', 'Jun' ],
      [ 'July', 'Jul' ],
      [ 'August', 'Aug' ],
      [ 'September', 'Sep' ],
      [ 'October', 'Oct' ],
      [ 'November', 'Nov' ],
      [ 'December', 'Dec' ]
    ];

    let dictionary = { 
      daysOfWeek, 
      monthsOfYear
    };

    const extendDictionary = (conf) => 
      Object.keys(conf).forEach(key => {
        if(dictionary[key] && dictionary[key].length == conf[key].length) {
          dictionary[key] = conf[key];
        }
      });

    var acceptedDateTokens = [
      { 
        // d: day of the month, 2 digits with leading zeros:
        key: 'd', 
        method: function(date) { return enforceLength(date.getDate(), 2); } 
      }, { 
        // D: textual representation of day, 3 letters: Sun thru Sat
        key: 'D', 
        method: function(date) { return dictionary.daysOfWeek[date.getDay()][1]; } 
      }, { 
        // j: day of month without leading 0's
        key: 'j', 
        method: function(date) { return date.getDate(); } 
      }, { 
        // l: full textual representation of day of week: Sunday thru Saturday
        key: 'l', 
        method: function(date) { return dictionary.daysOfWeek[date.getDay()][0]; } 
      }, { 
        // F: full text month: 'January' thru 'December'
        key: 'F', 
        method: function(date) { return dictionary.monthsOfYear[date.getMonth()][0]; } 
      }, { 
        // m: 2 digit numeric month: '01' - '12':
        key: 'm', 
        method: function(date) { return enforceLength(date.getMonth()+1,2); } 
      }, { 
        // M: a short textual representation of the month, 3 letters: 'Jan' - 'Dec'
        key: 'M', 
        method: function(date) { return dictionary.monthsOfYear[date.getMonth()][1]; } 
      }, { 
        // n: numeric represetation of month w/o leading 0's, '1' - '12':
        key: 'n', 
        method: function(date) { return date.getMonth() + 1; } 
      }, { 
        // Y: Full numeric year, 4 digits
        key: 'Y', 
        method: function(date) { return date.getFullYear(); } 
      }, { 
        // y: 2 digit numeric year:
        key: 'y', 
        method: function(date) { return enforceLength(date.getFullYear(),2,true); }
       }
    ];

    var acceptedTimeTokens = [
      { 
        // a: lowercase ante meridiem and post meridiem 'am' or 'pm'
        key: 'a', 
        method: function(date) { return (date.getHours() > 11) ? 'pm' : 'am'; } 
      }, { 
        // A: uppercase ante merdiiem and post meridiem 'AM' or 'PM'
        key: 'A', 
        method: function(date) { return (date.getHours() > 11) ? 'PM' : 'AM'; } 
      }, { 
        // g: 12-hour format of an hour without leading zeros 1-12
        key: 'g', 
        method: function(date) { return date.getHours() % 12 || 12; } 
      }, { 
        // G: 24-hour format of an hour without leading zeros 0-23
        key: 'G', 
        method: function(date) { return date.getHours(); } 
      }, { 
        // h: 12-hour format of an hour with leading zeros 01-12
        key: 'h', 
        method: function(date) { return enforceLength(date.getHours()%12 || 12,2); } 
      }, { 
        // H: 24-hour format of an hour with leading zeros: 00-23
        key: 'H', 
        method: function(date) { return enforceLength(date.getHours(),2); } 
      }, { 
        // i: Minutes with leading zeros 00-59
        key: 'i', 
        method: function(date) { return enforceLength(date.getMinutes(),2); } 
      }, { 
        // s: Seconds with leading zeros 00-59
        key: 's', 
        method: function(date) { return enforceLength(date.getSeconds(),2); }
       }
    ];

    /**
     * Internationalization object for timeUtils.internationalize().
     * @typedef internationalizeObj
     * @property {Array} [daysOfWeek=[ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ]] daysOfWeek Weekday labels as strings, starting with Sunday.
     * @property {Array} [monthsOfYear=[ 'January','February','March','April','May','June','July','August','September','October','November','December' ]] monthsOfYear Month labels as strings, starting with January.
     */

    /**
     * This function can be used to support additional languages by passing an object with 
     * `daysOfWeek` and `monthsOfYear` attributes.  Each attribute should be an array of
     * strings (ex: `daysOfWeek: ['monday', 'tuesday', 'wednesday'...]`)
     *
     * @param {internationalizeObj} conf
     */
    const internationalize = (conf={}) => { 
      extendDictionary(conf);
    };

    /**
     * generic formatDate function which accepts dynamic templates
     * @param date {Date} Required
     * @param template {String} Optional
     * @returns {String}
     *
     * @example
     * formatDate(new Date(), '#{M}. #{j}, #{Y}')
     * @returns {Number} Returns a formatted date
     *
     */
    const formatDate = (date,template='#{m}/#{d}/#{Y}') => {
      acceptedDateTokens.forEach(token => {
        if(template.indexOf(`#{${token.key}}`) == -1) return; 
        template = injectStringData(template,token.key,token.method(date));
      }); 
      acceptedTimeTokens.forEach(token => {
        if(template.indexOf(`#{${token.key}}`) == -1) return;
        template = injectStringData(template,token.key,token.method(date));
      });
      return template;
    };

    const keyCodes = {
      left: 37,
      up: 38,
      right: 39,
      down: 40,
      pgup: 33,
      pgdown: 34,
      enter: 13,
      escape: 27,
      tab: 9
    };

    const keyCodesArray = Object.keys(keyCodes).map(k => keyCodes[k]);

    /* src/svelte/components/calendar/Datepicker.svelte generated by Svelte v3.24.0 */

    const { document: document_1$1 } = globals;
    const file$4 = "src/svelte/components/calendar/Datepicker.svelte";

    function add_css$4() {
    	var style = element("style");
    	style.id = "svelte-1lorc63-style";
    	style.textContent = ".datepicker.svelte-1lorc63.svelte-1lorc63{display:inline-block;margin:0 auto;text-align:center;overflow:visible}.calendar-button.svelte-1lorc63.svelte-1lorc63{padding:10px 20px;border:1px solid var(--button-border-color);display:block;text-align:center;width:300px;text-decoration:none;cursor:pointer;background:var(--button-background-color);color:var(--button-text-color);border-radius:7px;box-shadow:0px 0px 3px rgba(0, 0, 0, 0.1)}.svelte-1lorc63.svelte-1lorc63,.svelte-1lorc63.svelte-1lorc63:before,.svelte-1lorc63.svelte-1lorc63:after{box-sizing:inherit}.calendar.svelte-1lorc63.svelte-1lorc63{box-sizing:border-box;position:relative;overflow:hidden;user-select:none;width:100vw;padding:10px;padding-top:0}@media(min-width: 480px){.calendar.svelte-1lorc63.svelte-1lorc63{height:auto;width:340px;max-width:100%}}.legend.svelte-1lorc63.svelte-1lorc63{color:#4a4a4a;padding:10px 0;margin-bottom:5px}.legend.svelte-1lorc63 span.svelte-1lorc63{width:14.285714%;display:inline-block;text-align:center}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGF0ZXBpY2tlci5zdmVsdGUiLCJzb3VyY2VzIjpbIkRhdGVwaWNrZXIuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG4gIGltcG9ydCBNb250aCBmcm9tICcuL01vbnRoLnN2ZWx0ZSc7XG4gIGltcG9ydCBOYXZCYXIgZnJvbSAnLi9OYXZCYXIuc3ZlbHRlJztcbiAgaW1wb3J0IFBvcG92ZXIgZnJvbSAnLi9Qb3BvdmVyLnN2ZWx0ZSc7XG4gIGltcG9ydCB7IGdldE1vbnRocyB9IGZyb20gJy4vbGliL2hlbHBlcnMnO1xuICBpbXBvcnQgeyBmb3JtYXREYXRlLCBpbnRlcm5hdGlvbmFsaXplIH0gZnJvbSAndGltZVV0aWxzJztcbiAgaW1wb3J0IHsga2V5Q29kZXMsIGtleUNvZGVzQXJyYXkgfSBmcm9tICcuL2xpYi9rZXlDb2Rlcyc7XG4gIGltcG9ydCB7IG9uTW91bnQsIGNyZWF0ZUV2ZW50RGlzcGF0Y2hlciB9IGZyb20gJ3N2ZWx0ZSc7XG5cbiAgY29uc3QgZGlzcGF0Y2ggPSBjcmVhdGVFdmVudERpc3BhdGNoZXIoKTtcbiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpO1xuXG4gIGxldCBwb3BvdmVyO1xuXG4gIGV4cG9ydCBsZXQgZm9ybWF0ID0gJyN7bX0vI3tkfS8je1l9JztcbiAgZXhwb3J0IGxldCBzdGFydCA9IG5ldyBEYXRlKDE5ODcsIDksIDI5KTtcbiAgZXhwb3J0IGxldCBlbmQgPSBuZXcgRGF0ZSgyMDIwLCA5LCAyOSk7XG4gIGV4cG9ydCBsZXQgc2VsZWN0ZWQgPSB0b2RheTtcbiAgZXhwb3J0IGxldCBkYXRlQ2hvc2VuID0gZmFsc2U7XG4gIGV4cG9ydCBsZXQgdHJpZ2dlciA9IG51bGw7XG4gIGV4cG9ydCBsZXQgc2VsZWN0YWJsZUNhbGxiYWNrID0gbnVsbDtcbiAgZXhwb3J0IGxldCB3ZWVrU3RhcnQgPSAwO1xuICBleHBvcnQgbGV0IGRheXNPZldlZWsgPSBbXG4gICAgWydTdW5kYXknLCAnU3VuJ10sXG4gICAgWydNb25kYXknLCAnTW9uJ10sXG4gICAgWydUdWVzZGF5JywgJ1R1ZSddLFxuICAgIFsnV2VkbmVzZGF5JywgJ1dlZCddLFxuICAgIFsnVGh1cnNkYXknLCAnVGh1J10sXG4gICAgWydGcmlkYXknLCAnRnJpJ10sXG4gICAgWydTYXR1cmRheScsICdTYXQnXVxuICBdO1xuICBleHBvcnQgbGV0IG1vbnRoc09mWWVhciA9IFtcbiAgICBbJ0phbnVhcnknLCAnSmFuJ10sXG4gICAgWydGZWJydWFyeScsICdGZWInXSxcbiAgICBbJ01hcmNoJywgJ01hciddLFxuICAgIFsnQXByaWwnLCAnQXByJ10sXG4gICAgWydNYXknLCAnTWF5J10sXG4gICAgWydKdW5lJywgJ0p1biddLFxuICAgIFsnSnVseScsICdKdWwnXSxcbiAgICBbJ0F1Z3VzdCcsICdBdWcnXSxcbiAgICBbJ1NlcHRlbWJlcicsICdTZXAnXSxcbiAgICBbJ09jdG9iZXInLCAnT2N0J10sXG4gICAgWydOb3ZlbWJlcicsICdOb3YnXSxcbiAgICBbJ0RlY2VtYmVyJywgJ0RlYyddXG4gIF07XG5cbiAgZXhwb3J0IGxldCBzdHlsZSA9ICcnO1xuICBcbiAgLy8gdGhlbWluZyB2YXJpYWJsZXM6XG4gIGV4cG9ydCBsZXQgYnV0dG9uQmFja2dyb3VuZENvbG9yID0gJyNmZmYnO1xuICBleHBvcnQgbGV0IGJ1dHRvbkJvcmRlckNvbG9yID0gJyNlZWUnO1xuICBleHBvcnQgbGV0IGJ1dHRvblRleHRDb2xvciA9ICcjMzMzJztcbiAgZXhwb3J0IGxldCBoaWdobGlnaHRDb2xvciA9ICcjZjc5MDFlJztcbiAgZXhwb3J0IGxldCBkYXlCYWNrZ3JvdW5kQ29sb3IgPSAnbm9uZSc7XG4gIGV4cG9ydCBsZXQgZGF5VGV4dENvbG9yID0gJyM0YTRhNGEnO1xuICBleHBvcnQgbGV0IGRheUhpZ2hsaWdodGVkQmFja2dyb3VuZENvbG9yID0gJyNlZmVmZWYnO1xuICBleHBvcnQgbGV0IGRheUhpZ2hsaWdodGVkVGV4dENvbG9yID0gJyM0YTRhNGEnO1xuXG4gIGludGVybmF0aW9uYWxpemUoeyBkYXlzT2ZXZWVrLCBtb250aHNPZlllYXIgfSk7XG4gIGxldCBzb3J0ZWREYXlzT2ZXZWVrID0gd2Vla1N0YXJ0ID09PSAwID8gZGF5c09mV2VlayA6ICgoKSA9PiB7XG4gICAgbGV0IGRvdyA9IGRheXNPZldlZWsuc2xpY2UoKTtcbiAgICBkb3cucHVzaChkb3cuc2hpZnQoKSk7XG4gICAgcmV0dXJuIGRvdztcbiAgfSkoKTtcblxuICBsZXQgaGlnaGxpZ2h0ZWQgPSB0b2RheTtcbiAgbGV0IHNob3VsZFNoYWtlRGF0ZSA9IGZhbHNlO1xuICBsZXQgc2hha2VIaWdobGlnaHRUaW1lb3V0O1xuICBsZXQgbW9udGggPSB0b2RheS5nZXRNb250aCgpO1xuICBsZXQgeWVhciA9IHRvZGF5LmdldEZ1bGxZZWFyKCk7XG5cbiAgbGV0IGlzT3BlbiA9IGZhbHNlO1xuICBsZXQgaXNDbG9zaW5nID0gZmFsc2U7XG5cbiAgdG9kYXkuc2V0SG91cnMoMCwgMCwgMCwgMCk7XG5cbiAgZnVuY3Rpb24gYXNzaWdubWVudEhhbmRsZXIoZm9ybWF0dGVkKSB7XG4gICAgaWYgKCF0cmlnZ2VyKSByZXR1cm47XG4gICAgdHJpZ2dlci5pbm5lckhUTUwgPSBmb3JtYXR0ZWQ7XG4gIH1cblxuICAkOiBtb250aHMgPSBnZXRNb250aHMoc3RhcnQsIGVuZCwgc2VsZWN0YWJsZUNhbGxiYWNrLCB3ZWVrU3RhcnQpO1xuXG4gIGxldCBtb250aEluZGV4ID0gMDtcbiAgJDoge1xuICAgIG1vbnRoSW5kZXggPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9udGhzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBpZiAobW9udGhzW2ldLm1vbnRoID09PSBtb250aCAmJiBtb250aHNbaV0ueWVhciA9PT0geWVhcikge1xuICAgICAgICBtb250aEluZGV4ID0gaTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgJDogdmlzaWJsZU1vbnRoID0gbW9udGhzW21vbnRoSW5kZXhdO1xuXG4gICQ6IHZpc2libGVNb250aElkID0geWVhciArIG1vbnRoIC8gMTAwO1xuICAkOiBsYXN0VmlzaWJsZURhdGUgPSB2aXNpYmxlTW9udGgud2Vla3NbdmlzaWJsZU1vbnRoLndlZWtzLmxlbmd0aCAtIDFdLmRheXNbNl0uZGF0ZTtcbiAgJDogZmlyc3RWaXNpYmxlRGF0ZSA9IHZpc2libGVNb250aC53ZWVrc1swXS5kYXlzWzBdLmRhdGU7XG4gICQ6IGNhbkluY3JlbWVudE1vbnRoID0gbW9udGhJbmRleCA8IG1vbnRocy5sZW5ndGggLSAxO1xuICAkOiBjYW5EZWNyZW1lbnRNb250aCA9IG1vbnRoSW5kZXggPiAwO1xuICAkOiB3cmFwcGVyU3R5bGUgPSBgXG4gICAgLS1idXR0b24tYmFja2dyb3VuZC1jb2xvcjogJHtidXR0b25CYWNrZ3JvdW5kQ29sb3J9O1xuICAgIC0tYnV0dG9uLWJvcmRlci1jb2xvcjogJHtidXR0b25Cb3JkZXJDb2xvcn07XG4gICAgLS1idXR0b24tdGV4dC1jb2xvcjogJHtidXR0b25UZXh0Q29sb3J9O1xuICAgIC0taGlnaGxpZ2h0LWNvbG9yOiAke2hpZ2hsaWdodENvbG9yfTtcbiAgICAtLWRheS1iYWNrZ3JvdW5kLWNvbG9yOiAke2RheUJhY2tncm91bmRDb2xvcn07XG4gICAgLS1kYXktdGV4dC1jb2xvcjogJHtkYXlUZXh0Q29sb3J9O1xuICAgIC0tZGF5LWhpZ2hsaWdodGVkLWJhY2tncm91bmQtY29sb3I6ICR7ZGF5SGlnaGxpZ2h0ZWRCYWNrZ3JvdW5kQ29sb3J9O1xuICAgIC0tZGF5LWhpZ2hsaWdodGVkLXRleHQtY29sb3I6ICR7ZGF5SGlnaGxpZ2h0ZWRUZXh0Q29sb3J9O1xuICAgICR7c3R5bGV9XG4gIGA7XG5cbiAgZXhwb3J0IGxldCBmb3JtYXR0ZWRTZWxlY3RlZDtcbiAgJDoge1xuICAgIGZvcm1hdHRlZFNlbGVjdGVkID0gdHlwZW9mIGZvcm1hdCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgPyBmb3JtYXQoc2VsZWN0ZWQpXG4gICAgICA6IGZvcm1hdERhdGUoc2VsZWN0ZWQsIGZvcm1hdCk7XG4gIH1cblxuICBvbk1vdW50KCgpID0+IHtcbiAgICBtb250aCA9IHNlbGVjdGVkLmdldE1vbnRoKCk7XG4gICAgeWVhciA9IHNlbGVjdGVkLmdldEZ1bGxZZWFyKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIGNoYW5nZU1vbnRoKHNlbGVjdGVkTW9udGgpIHtcbiAgICBtb250aCA9IHNlbGVjdGVkTW9udGg7XG4gICAgaGlnaGxpZ2h0ZWQgPSBuZXcgRGF0ZSh5ZWFyLCBtb250aCwgMSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmNyZW1lbnRNb250aChkaXJlY3Rpb24sIGRheSA9IDEpIHtcbiAgICBpZiAoZGlyZWN0aW9uID09PSAxICYmICFjYW5JbmNyZW1lbnRNb250aCkgcmV0dXJuO1xuICAgIGlmIChkaXJlY3Rpb24gPT09IC0xICYmICFjYW5EZWNyZW1lbnRNb250aCkgcmV0dXJuO1xuICAgIGxldCBjdXJyZW50ID0gbmV3IERhdGUoeWVhciwgbW9udGgsIDEpO1xuICAgIGN1cnJlbnQuc2V0TW9udGgoY3VycmVudC5nZXRNb250aCgpICsgZGlyZWN0aW9uKTtcbiAgICBtb250aCA9IGN1cnJlbnQuZ2V0TW9udGgoKTtcbiAgICB5ZWFyID0gY3VycmVudC5nZXRGdWxsWWVhcigpO1xuICAgIGhpZ2hsaWdodGVkID0gbmV3IERhdGUoeWVhciwgbW9udGgsIGRheSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREZWZhdWx0SGlnaGxpZ2h0ZWQoKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKHNlbGVjdGVkKTtcbiAgfVxuXG4gIGNvbnN0IGdldERheSA9IChtLCBkLCB5KSA9PiB7XG4gICAgbGV0IHRoZU1vbnRoID0gbW9udGhzLmZpbmQoYU1vbnRoID0+IGFNb250aC5tb250aCA9PT0gbSAmJiBhTW9udGgueWVhciA9PT0geSk7XG4gICAgaWYgKCF0aGVNb250aCkgcmV0dXJuIG51bGw7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGVNb250aC53ZWVrcy5sZW5ndGg7ICsraSkge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRoZU1vbnRoLndlZWtzW2ldLmRheXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgbGV0IGFEYXkgPSB0aGVNb250aC53ZWVrc1tpXS5kYXlzW2pdO1xuICAgICAgICBpZiAoYURheS5tb250aCA9PT0gbSAmJiBhRGF5LmRheSA9PT0gZCAmJiBhRGF5LnllYXIgPT09IHkpIHJldHVybiBhRGF5O1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICBmdW5jdGlvbiBpbmNyZW1lbnREYXlIaWdobGlnaHRlZChhbW91bnQpIHtcbiAgICBsZXQgcHJvcG9zZWREYXRlID0gbmV3IERhdGUoaGlnaGxpZ2h0ZWQpO1xuICAgIHByb3Bvc2VkRGF0ZS5zZXREYXRlKGhpZ2hsaWdodGVkLmdldERhdGUoKSArIGFtb3VudCk7XG4gICAgbGV0IGNvcnJlc3BvbmRpbmdEYXlPYmogPSBnZXREYXkoXG4gICAgICBwcm9wb3NlZERhdGUuZ2V0TW9udGgoKSxcbiAgICAgIHByb3Bvc2VkRGF0ZS5nZXREYXRlKCksXG4gICAgICBwcm9wb3NlZERhdGUuZ2V0RnVsbFllYXIoKVxuICAgICk7XG4gICAgaWYgKCFjb3JyZXNwb25kaW5nRGF5T2JqIHx8ICFjb3JyZXNwb25kaW5nRGF5T2JqLmlzSW5SYW5nZSkgcmV0dXJuO1xuICAgIGhpZ2hsaWdodGVkID0gcHJvcG9zZWREYXRlO1xuICAgIGlmIChhbW91bnQgPiAwICYmIGhpZ2hsaWdodGVkID4gbGFzdFZpc2libGVEYXRlKSB7XG4gICAgICBpbmNyZW1lbnRNb250aCgxLCBoaWdobGlnaHRlZC5nZXREYXRlKCkpO1xuICAgIH1cbiAgICBpZiAoYW1vdW50IDwgMCAmJiBoaWdobGlnaHRlZCA8IGZpcnN0VmlzaWJsZURhdGUpIHtcbiAgICAgIGluY3JlbWVudE1vbnRoKC0xLCBoaWdobGlnaHRlZC5nZXREYXRlKCkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNoZWNrSWZWaXNpYmxlRGF0ZUlzU2VsZWN0YWJsZShkYXRlKSB7XG4gICAgY29uc3QgcHJvcG9zZWREYXkgPSBnZXREYXkoZGF0ZS5nZXRNb250aCgpLCBkYXRlLmdldERhdGUoKSwgZGF0ZS5nZXRGdWxsWWVhcigpKTtcbiAgICByZXR1cm4gcHJvcG9zZWREYXkgJiYgcHJvcG9zZWREYXkuc2VsZWN0YWJsZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNoYWtlRGF0ZShkYXRlKSB7XG4gICAgY2xlYXJUaW1lb3V0KHNoYWtlSGlnaGxpZ2h0VGltZW91dCk7XG4gICAgc2hvdWxkU2hha2VEYXRlID0gZGF0ZTtcbiAgICBzaGFrZUhpZ2hsaWdodFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHNob3VsZFNoYWtlRGF0ZSA9IGZhbHNlO1xuICAgIH0sIDcwMCk7XG4gIH1cblxuICBmdW5jdGlvbiBhc3NpZ25WYWx1ZVRvVHJpZ2dlcihmb3JtYXR0ZWQpIHtcbiAgICBhc3NpZ25tZW50SGFuZGxlcihmb3JtYXR0ZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVnaXN0ZXJTZWxlY3Rpb24oY2hvc2VuKSB7XG4gICAgaWYgKCFjaGVja0lmVmlzaWJsZURhdGVJc1NlbGVjdGFibGUoY2hvc2VuKSkgcmV0dXJuIHNoYWtlRGF0ZShjaG9zZW4pO1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZVxuICAgIGNsb3NlKCk7XG4gICAgc2VsZWN0ZWQgPSBjaG9zZW47XG4gICAgZGF0ZUNob3NlbiA9IHRydWU7XG4gICAgYXNzaWduVmFsdWVUb1RyaWdnZXIoZm9ybWF0dGVkU2VsZWN0ZWQpO1xuICAgIHJldHVybiBkaXNwYXRjaCgnZGF0ZVNlbGVjdGVkJywgeyBkYXRlOiBjaG9zZW4gfSk7XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVLZXlQcmVzcyhldnQpIHtcbiAgICBpZiAoa2V5Q29kZXNBcnJheS5pbmRleE9mKGV2dC5rZXlDb2RlKSA9PT0gLTEpIHJldHVybjtcbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBzd2l0Y2ggKGV2dC5rZXlDb2RlKSB7XG4gICAgICBjYXNlIGtleUNvZGVzLmxlZnQ6XG4gICAgICAgIGluY3JlbWVudERheUhpZ2hsaWdodGVkKC0xKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGtleUNvZGVzLnVwOlxuICAgICAgICBpbmNyZW1lbnREYXlIaWdobGlnaHRlZCgtNyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBrZXlDb2Rlcy5yaWdodDpcbiAgICAgICAgaW5jcmVtZW50RGF5SGlnaGxpZ2h0ZWQoMSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBrZXlDb2Rlcy5kb3duOlxuICAgICAgICBpbmNyZW1lbnREYXlIaWdobGlnaHRlZCg3KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGtleUNvZGVzLnBndXA6XG4gICAgICAgIGluY3JlbWVudE1vbnRoKC0xKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGtleUNvZGVzLnBnZG93bjpcbiAgICAgICAgaW5jcmVtZW50TW9udGgoMSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBrZXlDb2Rlcy5lc2NhcGU6XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZVxuICAgICAgICBjbG9zZSgpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2Uga2V5Q29kZXMuZW50ZXI6XG4gICAgICAgIHJlZ2lzdGVyU2VsZWN0aW9uKGhpZ2hsaWdodGVkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZWdpc3RlckNsb3NlKCkge1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVLZXlQcmVzcyk7XG4gICAgZGlzcGF0Y2goJ2Nsb3NlJyk7XG4gIH1cblxuICBmdW5jdGlvbiBjbG9zZSgpIHtcbiAgICBwb3BvdmVyLmNsb3NlKCk7XG4gICAgcmVnaXN0ZXJDbG9zZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVnaXN0ZXJPcGVuKCkge1xuICAgIGhpZ2hsaWdodGVkID0gZ2V0RGVmYXVsdEhpZ2hsaWdodGVkKCk7XG4gICAgbW9udGggPSBzZWxlY3RlZC5nZXRNb250aCgpO1xuICAgIHllYXIgPSBzZWxlY3RlZC5nZXRGdWxsWWVhcigpO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVLZXlQcmVzcyk7XG4gICAgZGlzcGF0Y2goJ29wZW4nKTtcbiAgfVxuXG48L3NjcmlwdD5cblxuPGRpdiBcbiAgY2xhc3M9XCJkYXRlcGlja2VyXCIgXG4gIGNsYXNzOm9wZW49XCJ7aXNPcGVufVwiIFxuICBjbGFzczpjbG9zaW5nPVwie2lzQ2xvc2luZ31cIlxuICBzdHlsZT17d3JhcHBlclN0eWxlfVxuPlxuICA8UG9wb3ZlclxuICAgIGJpbmQ6dGhpcz1cIntwb3BvdmVyfVwiXG4gICAgYmluZDpvcGVuPVwie2lzT3Blbn1cIlxuICAgIGJpbmQ6c2hyaW5rPVwie2lzQ2xvc2luZ31cIlxuICAgIHt0cmlnZ2VyfVxuICAgIG9uOm9wZW5lZD1cIntyZWdpc3Rlck9wZW59XCJcbiAgICBvbjpjbG9zZWQ9XCJ7cmVnaXN0ZXJDbG9zZX1cIlxuICA+XG4gICAgPGRpdiBzbG90PVwidHJpZ2dlclwiPlxuICAgICAgPHNsb3Qge3NlbGVjdGVkfSB7Zm9ybWF0dGVkU2VsZWN0ZWR9PlxuICAgICAgICB7I2lmICF0cmlnZ2VyfVxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiY2FsZW5kYXItYnV0dG9uXCIgdHlwZT1cImJ1dHRvblwiPlxuICAgICAgICAgIHtmb3JtYXR0ZWRTZWxlY3RlZH1cbiAgICAgICAgPC9idXR0b24+XG4gICAgICAgIHsvaWZ9XG4gICAgICA8L3Nsb3Q+XG4gICAgPC9kaXY+XG4gICAgPGRpdiBzbG90PVwiY29udGVudHNcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYWxlbmRhclwiPlxuICAgICAgICA8TmF2QmFyIFxuICAgICAgICAgIHttb250aH1cbiAgICAgICAgICB7eWVhcn1cbiAgICAgICAgICB7Y2FuSW5jcmVtZW50TW9udGh9XG4gICAgICAgICAge2NhbkRlY3JlbWVudE1vbnRofVxuICAgICAgICAgIHtzdGFydH1cbiAgICAgICAgICB7ZW5kfVxuICAgICAgICAgIHttb250aHNPZlllYXJ9XG4gICAgICAgICAgb246bW9udGhTZWxlY3RlZD17ZSA9PiBjaGFuZ2VNb250aChlLmRldGFpbCl9XG4gICAgICAgICAgb246aW5jcmVtZW50TW9udGg9e2UgPT4gaW5jcmVtZW50TW9udGgoZS5kZXRhaWwpfSBcbiAgICAgICAgLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxlZ2VuZFwiPlxuICAgICAgICAgIHsjZWFjaCBzb3J0ZWREYXlzT2ZXZWVrIGFzIGRheX1cbiAgICAgICAgICA8c3Bhbj57ZGF5WzFdfTwvc3Bhbj5cbiAgICAgICAgICB7L2VhY2h9XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8TW9udGggXG4gICAgICAgICAge3Zpc2libGVNb250aH1cbiAgICAgICAgICB7c2VsZWN0ZWR9XG4gICAgICAgICAge2hpZ2hsaWdodGVkfVxuICAgICAgICAgIHtzaG91bGRTaGFrZURhdGV9XG4gICAgICAgICAgaWQ9e3Zpc2libGVNb250aElkfVxuICAgICAgICAgIG9uOmRhdGVTZWxlY3RlZD17ZSA9PiByZWdpc3RlclNlbGVjdGlvbihlLmRldGFpbCl9IFxuICAgICAgICAvPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIDwvUG9wb3Zlcj5cbjwvZGl2PlxuXG48c3R5bGU+XG4gIC5kYXRlcGlja2VyIHtcbiAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgbWFyZ2luOiAwIGF1dG87XG4gICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIG92ZXJmbG93OiB2aXNpYmxlO1xuICB9XG5cbiAgLmNhbGVuZGFyLWJ1dHRvbiB7XG4gICAgcGFkZGluZzogMTBweCAyMHB4O1xuICAgIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJ1dHRvbi1ib3JkZXItY29sb3IpO1xuICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICB3aWR0aDogMzAwcHg7XG4gICAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICBiYWNrZ3JvdW5kOiB2YXIoLS1idXR0b24tYmFja2dyb3VuZC1jb2xvcik7XG4gICAgY29sb3I6IHZhcigtLWJ1dHRvbi10ZXh0LWNvbG9yKTtcbiAgICBib3JkZXItcmFkaXVzOiA3cHg7XG4gICAgYm94LXNoYWRvdzogMHB4IDBweCAzcHggcmdiYSgwLCAwLCAwLCAwLjEpO1xuICB9XG5cbiAgKixcbiAgKjpiZWZvcmUsXG4gICo6YWZ0ZXIge1xuICAgIGJveC1zaXppbmc6IGluaGVyaXQ7XG4gIH1cblxuICAuY2FsZW5kYXIge1xuICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG4gICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgdXNlci1zZWxlY3Q6IG5vbmU7XG4gICAgd2lkdGg6IDEwMHZ3O1xuICAgIHBhZGRpbmc6IDEwcHg7XG4gICAgcGFkZGluZy10b3A6IDA7XG4gIH1cblxuICBAbWVkaWEgKG1pbi13aWR0aDogNDgwcHgpIHtcbiAgICAuY2FsZW5kYXIge1xuICAgICAgaGVpZ2h0OiBhdXRvO1xuICAgICAgd2lkdGg6IDM0MHB4O1xuICAgICAgbWF4LXdpZHRoOiAxMDAlO1xuICAgIH1cbiAgfVxuXG4gIC5sZWdlbmQge1xuICAgIGNvbG9yOiAjNGE0YTRhO1xuICAgIHBhZGRpbmc6IDEwcHggMDtcbiAgICBtYXJnaW4tYm90dG9tOiA1cHg7XG4gIH1cblxuICAubGVnZW5kIHNwYW4ge1xuICAgIHdpZHRoOiAxNC4yODU3MTQlO1xuICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gIH1cbjwvc3R5bGU+XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBc1RFLFdBQVcsOEJBQUMsQ0FBQyxBQUNYLE9BQU8sQ0FBRSxZQUFZLENBQ3JCLE1BQU0sQ0FBRSxDQUFDLENBQUMsSUFBSSxDQUNkLFVBQVUsQ0FBRSxNQUFNLENBQ2xCLFFBQVEsQ0FBRSxPQUFPLEFBQ25CLENBQUMsQUFFRCxnQkFBZ0IsOEJBQUMsQ0FBQyxBQUNoQixPQUFPLENBQUUsSUFBSSxDQUFDLElBQUksQ0FDbEIsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxDQUM1QyxPQUFPLENBQUUsS0FBSyxDQUNkLFVBQVUsQ0FBRSxNQUFNLENBQ2xCLEtBQUssQ0FBRSxLQUFLLENBQ1osZUFBZSxDQUFFLElBQUksQ0FDckIsTUFBTSxDQUFFLE9BQU8sQ0FDZixVQUFVLENBQUUsSUFBSSx5QkFBeUIsQ0FBQyxDQUMxQyxLQUFLLENBQUUsSUFBSSxtQkFBbUIsQ0FBQyxDQUMvQixhQUFhLENBQUUsR0FBRyxDQUNsQixVQUFVLENBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQUFDNUMsQ0FBQyxBQUVELDhCQUFDLENBQ0QsOEJBQUMsT0FBTyxDQUNSLDhCQUFDLE1BQU0sQUFBQyxDQUFDLEFBQ1AsVUFBVSxDQUFFLE9BQU8sQUFDckIsQ0FBQyxBQUVELFNBQVMsOEJBQUMsQ0FBQyxBQUNULFVBQVUsQ0FBRSxVQUFVLENBQ3RCLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLFFBQVEsQ0FBRSxNQUFNLENBQ2hCLFdBQVcsQ0FBRSxJQUFJLENBQ2pCLEtBQUssQ0FBRSxLQUFLLENBQ1osT0FBTyxDQUFFLElBQUksQ0FDYixXQUFXLENBQUUsQ0FBQyxBQUNoQixDQUFDLEFBRUQsTUFBTSxBQUFDLFlBQVksS0FBSyxDQUFDLEFBQUMsQ0FBQyxBQUN6QixTQUFTLDhCQUFDLENBQUMsQUFDVCxNQUFNLENBQUUsSUFBSSxDQUNaLEtBQUssQ0FBRSxLQUFLLENBQ1osU0FBUyxDQUFFLElBQUksQUFDakIsQ0FBQyxBQUNILENBQUMsQUFFRCxPQUFPLDhCQUFDLENBQUMsQUFDUCxLQUFLLENBQUUsT0FBTyxDQUNkLE9BQU8sQ0FBRSxJQUFJLENBQUMsQ0FBQyxDQUNmLGFBQWEsQ0FBRSxHQUFHLEFBQ3BCLENBQUMsQUFFRCxzQkFBTyxDQUFDLElBQUksZUFBQyxDQUFDLEFBQ1osS0FBSyxDQUFFLFVBQVUsQ0FDakIsT0FBTyxDQUFFLFlBQVksQ0FDckIsVUFBVSxDQUFFLE1BQU0sQUFDcEIsQ0FBQyJ9 */";
    	append_dev(document_1$1.head, style);
    }

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[62] = list[i];
    	return child_ctx;
    }

    const get_default_slot_changes = dirty => ({
    	selected: dirty[0] & /*selected*/ 1,
    	formattedSelected: dirty[0] & /*formattedSelected*/ 4
    });

    const get_default_slot_context = ctx => ({
    	selected: /*selected*/ ctx[0],
    	formattedSelected: /*formattedSelected*/ ctx[2]
    });

    // (272:8) {#if !trigger}
    function create_if_block(ctx) {
    	let button;
    	let t;

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text(/*formattedSelected*/ ctx[2]);
    			attr_dev(button, "class", "calendar-button svelte-1lorc63");
    			attr_dev(button, "type", "button");
    			add_location(button, file$4, 272, 8, 7574);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*formattedSelected*/ 4) set_data_dev(t, /*formattedSelected*/ ctx[2]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(272:8) {#if !trigger}",
    		ctx
    	});

    	return block;
    }

    // (271:43)          
    function fallback_block(ctx) {
    	let if_block_anchor;
    	let if_block = !/*trigger*/ ctx[1] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (!/*trigger*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block.name,
    		type: "fallback",
    		source: "(271:43)          ",
    		ctx
    	});

    	return block;
    }

    // (270:4) <div slot="trigger">
    function create_trigger_slot(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[38].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[45], get_default_slot_context);
    	const default_slot_or_fallback = default_slot || fallback_block(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (default_slot_or_fallback) default_slot_or_fallback.c();
    			attr_dev(div, "slot", "trigger");
    			attr_dev(div, "class", "svelte-1lorc63");
    			add_location(div, file$4, 269, 4, 7478);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (default_slot_or_fallback) {
    				default_slot_or_fallback.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[0] & /*selected, formattedSelected*/ 5 | dirty[1] & /*$$scope*/ 16384) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[45], dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			} else {
    				if (default_slot_or_fallback && default_slot_or_fallback.p && dirty[0] & /*formattedSelected, trigger*/ 6) {
    					default_slot_or_fallback.p(ctx, dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_trigger_slot.name,
    		type: "slot",
    		source: "(270:4) <div slot=\\\"trigger\\\">",
    		ctx
    	});

    	return block;
    }

    // (293:10) {#each sortedDaysOfWeek as day}
    function create_each_block$3(ctx) {
    	let span;
    	let t_value = /*day*/ ctx[62][1] + "";
    	let t;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr_dev(span, "class", "svelte-1lorc63");
    			add_location(span, file$4, 293, 10, 8143);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(293:10) {#each sortedDaysOfWeek as day}",
    		ctx
    	});

    	return block;
    }

    // (279:4) <div slot="contents">
    function create_contents_slot(ctx) {
    	let div0;
    	let div2;
    	let navbar;
    	let t0;
    	let div1;
    	let t1;
    	let month_1;
    	let current;

    	navbar = new NavBar({
    			props: {
    				month: /*month*/ ctx[9],
    				year: /*year*/ ctx[10],
    				canIncrementMonth: /*canIncrementMonth*/ ctx[15],
    				canDecrementMonth: /*canDecrementMonth*/ ctx[16],
    				start: /*start*/ ctx[3],
    				end: /*end*/ ctx[4],
    				monthsOfYear: /*monthsOfYear*/ ctx[5]
    			},
    			$$inline: true
    		});

    	navbar.$on("monthSelected", /*monthSelected_handler*/ ctx[39]);
    	navbar.$on("incrementMonth", /*incrementMonth_handler*/ ctx[40]);
    	let each_value = /*sortedDaysOfWeek*/ ctx[18];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	month_1 = new Month({
    			props: {
    				visibleMonth: /*visibleMonth*/ ctx[13],
    				selected: /*selected*/ ctx[0],
    				highlighted: /*highlighted*/ ctx[7],
    				shouldShakeDate: /*shouldShakeDate*/ ctx[8],
    				id: /*visibleMonthId*/ ctx[14]
    			},
    			$$inline: true
    		});

    	month_1.$on("dateSelected", /*dateSelected_handler*/ ctx[41]);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			div2 = element("div");
    			create_component(navbar.$$.fragment);
    			t0 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			create_component(month_1.$$.fragment);
    			attr_dev(div1, "class", "legend svelte-1lorc63");
    			add_location(div1, file$4, 291, 8, 8070);
    			attr_dev(div2, "class", "calendar svelte-1lorc63");
    			add_location(div2, file$4, 279, 6, 7740);
    			attr_dev(div0, "slot", "contents");
    			attr_dev(div0, "class", "svelte-1lorc63");
    			add_location(div0, file$4, 278, 4, 7712);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, div2);
    			mount_component(navbar, div2, null);
    			append_dev(div2, t0);
    			append_dev(div2, div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			append_dev(div2, t1);
    			mount_component(month_1, div2, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const navbar_changes = {};
    			if (dirty[0] & /*month*/ 512) navbar_changes.month = /*month*/ ctx[9];
    			if (dirty[0] & /*year*/ 1024) navbar_changes.year = /*year*/ ctx[10];
    			if (dirty[0] & /*canIncrementMonth*/ 32768) navbar_changes.canIncrementMonth = /*canIncrementMonth*/ ctx[15];
    			if (dirty[0] & /*canDecrementMonth*/ 65536) navbar_changes.canDecrementMonth = /*canDecrementMonth*/ ctx[16];
    			if (dirty[0] & /*start*/ 8) navbar_changes.start = /*start*/ ctx[3];
    			if (dirty[0] & /*end*/ 16) navbar_changes.end = /*end*/ ctx[4];
    			if (dirty[0] & /*monthsOfYear*/ 32) navbar_changes.monthsOfYear = /*monthsOfYear*/ ctx[5];
    			navbar.$set(navbar_changes);

    			if (dirty[0] & /*sortedDaysOfWeek*/ 262144) {
    				each_value = /*sortedDaysOfWeek*/ ctx[18];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			const month_1_changes = {};
    			if (dirty[0] & /*visibleMonth*/ 8192) month_1_changes.visibleMonth = /*visibleMonth*/ ctx[13];
    			if (dirty[0] & /*selected*/ 1) month_1_changes.selected = /*selected*/ ctx[0];
    			if (dirty[0] & /*highlighted*/ 128) month_1_changes.highlighted = /*highlighted*/ ctx[7];
    			if (dirty[0] & /*shouldShakeDate*/ 256) month_1_changes.shouldShakeDate = /*shouldShakeDate*/ ctx[8];
    			if (dirty[0] & /*visibleMonthId*/ 16384) month_1_changes.id = /*visibleMonthId*/ ctx[14];
    			month_1.$set(month_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(navbar.$$.fragment, local);
    			transition_in(month_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(navbar.$$.fragment, local);
    			transition_out(month_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			destroy_component(navbar);
    			destroy_each(each_blocks, detaching);
    			destroy_component(month_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_contents_slot.name,
    		type: "slot",
    		source: "(279:4) <div slot=\\\"contents\\\">",
    		ctx
    	});

    	return block;
    }

    // (262:2) <Popover     bind:this="{popover}"     bind:open="{isOpen}"     bind:shrink="{isClosing}"     {trigger}     on:opened="{registerOpen}"     on:closed="{registerClose}"   >
    function create_default_slot(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = space();
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(262:2) <Popover     bind:this=\\\"{popover}\\\"     bind:open=\\\"{isOpen}\\\"     bind:shrink=\\\"{isClosing}\\\"     {trigger}     on:opened=\\\"{registerOpen}\\\"     on:closed=\\\"{registerClose}\\\"   >",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div;
    	let popover_1;
    	let updating_open;
    	let updating_shrink;
    	let current;

    	function popover_1_open_binding(value) {
    		/*popover_1_open_binding*/ ctx[43].call(null, value);
    	}

    	function popover_1_shrink_binding(value) {
    		/*popover_1_shrink_binding*/ ctx[44].call(null, value);
    	}

    	let popover_1_props = {
    		trigger: /*trigger*/ ctx[1],
    		$$slots: {
    			default: [create_default_slot],
    			contents: [create_contents_slot],
    			trigger: [create_trigger_slot]
    		},
    		$$scope: { ctx }
    	};

    	if (/*isOpen*/ ctx[11] !== void 0) {
    		popover_1_props.open = /*isOpen*/ ctx[11];
    	}

    	if (/*isClosing*/ ctx[12] !== void 0) {
    		popover_1_props.shrink = /*isClosing*/ ctx[12];
    	}

    	popover_1 = new Popover({ props: popover_1_props, $$inline: true });
    	/*popover_1_binding*/ ctx[42](popover_1);
    	binding_callbacks.push(() => bind(popover_1, "open", popover_1_open_binding));
    	binding_callbacks.push(() => bind(popover_1, "shrink", popover_1_shrink_binding));
    	popover_1.$on("opened", /*registerOpen*/ ctx[23]);
    	popover_1.$on("closed", /*registerClose*/ ctx[22]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(popover_1.$$.fragment);
    			attr_dev(div, "class", "datepicker svelte-1lorc63");
    			attr_dev(div, "style", /*wrapperStyle*/ ctx[17]);
    			toggle_class(div, "open", /*isOpen*/ ctx[11]);
    			toggle_class(div, "closing", /*isClosing*/ ctx[12]);
    			add_location(div, file$4, 255, 0, 7193);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(popover_1, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const popover_1_changes = {};
    			if (dirty[0] & /*trigger*/ 2) popover_1_changes.trigger = /*trigger*/ ctx[1];

    			if (dirty[0] & /*visibleMonth, selected, highlighted, shouldShakeDate, visibleMonthId, month, year, canIncrementMonth, canDecrementMonth, start, end, monthsOfYear, formattedSelected, trigger*/ 124863 | dirty[1] & /*$$scope*/ 16384) {
    				popover_1_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_open && dirty[0] & /*isOpen*/ 2048) {
    				updating_open = true;
    				popover_1_changes.open = /*isOpen*/ ctx[11];
    				add_flush_callback(() => updating_open = false);
    			}

    			if (!updating_shrink && dirty[0] & /*isClosing*/ 4096) {
    				updating_shrink = true;
    				popover_1_changes.shrink = /*isClosing*/ ctx[12];
    				add_flush_callback(() => updating_shrink = false);
    			}

    			popover_1.$set(popover_1_changes);

    			if (!current || dirty[0] & /*wrapperStyle*/ 131072) {
    				attr_dev(div, "style", /*wrapperStyle*/ ctx[17]);
    			}

    			if (dirty[0] & /*isOpen*/ 2048) {
    				toggle_class(div, "open", /*isOpen*/ ctx[11]);
    			}

    			if (dirty[0] & /*isClosing*/ 4096) {
    				toggle_class(div, "closing", /*isClosing*/ ctx[12]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(popover_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(popover_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			/*popover_1_binding*/ ctx[42](null);
    			destroy_component(popover_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	const today = new Date();
    	let popover;
    	let { format = "#{m}/#{d}/#{Y}" } = $$props;
    	let { start = new Date(1987, 9, 29) } = $$props;
    	let { end = new Date(2020, 9, 29) } = $$props;
    	let { selected = today } = $$props;
    	let { dateChosen = false } = $$props;
    	let { trigger = null } = $$props;
    	let { selectableCallback = null } = $$props;
    	let { weekStart = 0 } = $$props;

    	let { daysOfWeek = [
    		["Sunday", "Sun"],
    		["Monday", "Mon"],
    		["Tuesday", "Tue"],
    		["Wednesday", "Wed"],
    		["Thursday", "Thu"],
    		["Friday", "Fri"],
    		["Saturday", "Sat"]
    	] } = $$props;

    	let { monthsOfYear = [
    		["January", "Jan"],
    		["February", "Feb"],
    		["March", "Mar"],
    		["April", "Apr"],
    		["May", "May"],
    		["June", "Jun"],
    		["July", "Jul"],
    		["August", "Aug"],
    		["September", "Sep"],
    		["October", "Oct"],
    		["November", "Nov"],
    		["December", "Dec"]
    	] } = $$props;

    	let { style = "" } = $$props;
    	let { buttonBackgroundColor = "#fff" } = $$props;
    	let { buttonBorderColor = "#eee" } = $$props;
    	let { buttonTextColor = "#333" } = $$props;
    	let { highlightColor = "#f7901e" } = $$props;
    	let { dayBackgroundColor = "none" } = $$props;
    	let { dayTextColor = "#4a4a4a" } = $$props;
    	let { dayHighlightedBackgroundColor = "#efefef" } = $$props;
    	let { dayHighlightedTextColor = "#4a4a4a" } = $$props;
    	internationalize({ daysOfWeek, monthsOfYear });

    	let sortedDaysOfWeek = weekStart === 0
    	? daysOfWeek
    	: (() => {
    			let dow = daysOfWeek.slice();
    			dow.push(dow.shift());
    			return dow;
    		})();

    	let highlighted = today;
    	let shouldShakeDate = false;
    	let shakeHighlightTimeout;
    	let month = today.getMonth();
    	let year = today.getFullYear();
    	let isOpen = false;
    	let isClosing = false;
    	today.setHours(0, 0, 0, 0);

    	function assignmentHandler(formatted) {
    		if (!trigger) return;
    		$$invalidate(1, trigger.innerHTML = formatted, trigger);
    	}

    	let monthIndex = 0;
    	let { formattedSelected } = $$props;

    	onMount(() => {
    		$$invalidate(9, month = selected.getMonth());
    		$$invalidate(10, year = selected.getFullYear());
    	});

    	function changeMonth(selectedMonth) {
    		$$invalidate(9, month = selectedMonth);
    		$$invalidate(7, highlighted = new Date(year, month, 1));
    	}

    	function incrementMonth(direction, day = 1) {
    		if (direction === 1 && !canIncrementMonth) return;
    		if (direction === -1 && !canDecrementMonth) return;
    		let current = new Date(year, month, 1);
    		current.setMonth(current.getMonth() + direction);
    		$$invalidate(9, month = current.getMonth());
    		$$invalidate(10, year = current.getFullYear());
    		$$invalidate(7, highlighted = new Date(year, month, day));
    	}

    	function getDefaultHighlighted() {
    		return new Date(selected);
    	}

    	const getDay = (m, d, y) => {
    		let theMonth = months.find(aMonth => aMonth.month === m && aMonth.year === y);
    		if (!theMonth) return null;

    		// eslint-disable-next-line
    		for (let i = 0; i < theMonth.weeks.length; ++i) {
    			// eslint-disable-next-line
    			for (let j = 0; j < theMonth.weeks[i].days.length; ++j) {
    				let aDay = theMonth.weeks[i].days[j];
    				if (aDay.month === m && aDay.day === d && aDay.year === y) return aDay;
    			}
    		}

    		return null;
    	};

    	function incrementDayHighlighted(amount) {
    		let proposedDate = new Date(highlighted);
    		proposedDate.setDate(highlighted.getDate() + amount);
    		let correspondingDayObj = getDay(proposedDate.getMonth(), proposedDate.getDate(), proposedDate.getFullYear());
    		if (!correspondingDayObj || !correspondingDayObj.isInRange) return;
    		$$invalidate(7, highlighted = proposedDate);

    		if (amount > 0 && highlighted > lastVisibleDate) {
    			incrementMonth(1, highlighted.getDate());
    		}

    		if (amount < 0 && highlighted < firstVisibleDate) {
    			incrementMonth(-1, highlighted.getDate());
    		}
    	}

    	function checkIfVisibleDateIsSelectable(date) {
    		const proposedDay = getDay(date.getMonth(), date.getDate(), date.getFullYear());
    		return proposedDay && proposedDay.selectable;
    	}

    	function shakeDate(date) {
    		clearTimeout(shakeHighlightTimeout);
    		$$invalidate(8, shouldShakeDate = date);

    		shakeHighlightTimeout = setTimeout(
    			() => {
    				$$invalidate(8, shouldShakeDate = false);
    			},
    			700
    		);
    	}

    	function assignValueToTrigger(formatted) {
    		assignmentHandler(formatted);
    	}

    	function registerSelection(chosen) {
    		if (!checkIfVisibleDateIsSelectable(chosen)) return shakeDate(chosen);

    		// eslint-disable-next-line
    		close();

    		$$invalidate(0, selected = chosen);
    		$$invalidate(24, dateChosen = true);
    		assignValueToTrigger(formattedSelected);
    		return dispatch("dateSelected", { date: chosen });
    	}

    	function handleKeyPress(evt) {
    		if (keyCodesArray.indexOf(evt.keyCode) === -1) return;
    		evt.preventDefault();

    		switch (evt.keyCode) {
    			case keyCodes.left:
    				incrementDayHighlighted(-1);
    				break;
    			case keyCodes.up:
    				incrementDayHighlighted(-7);
    				break;
    			case keyCodes.right:
    				incrementDayHighlighted(1);
    				break;
    			case keyCodes.down:
    				incrementDayHighlighted(7);
    				break;
    			case keyCodes.pgup:
    				incrementMonth(-1);
    				break;
    			case keyCodes.pgdown:
    				incrementMonth(1);
    				break;
    			case keyCodes.escape:
    				// eslint-disable-next-line
    				close();
    				break;
    			case keyCodes.enter:
    				registerSelection(highlighted);
    				break;
    		}
    	}

    	function registerClose() {
    		document.removeEventListener("keydown", handleKeyPress);
    		dispatch("close");
    	}

    	function close() {
    		popover.close();
    		registerClose();
    	}

    	function registerOpen() {
    		$$invalidate(7, highlighted = getDefaultHighlighted());
    		$$invalidate(9, month = selected.getMonth());
    		$$invalidate(10, year = selected.getFullYear());
    		document.addEventListener("keydown", handleKeyPress);
    		dispatch("open");
    	}

    	const writable_props = [
    		"format",
    		"start",
    		"end",
    		"selected",
    		"dateChosen",
    		"trigger",
    		"selectableCallback",
    		"weekStart",
    		"daysOfWeek",
    		"monthsOfYear",
    		"style",
    		"buttonBackgroundColor",
    		"buttonBorderColor",
    		"buttonTextColor",
    		"highlightColor",
    		"dayBackgroundColor",
    		"dayTextColor",
    		"dayHighlightedBackgroundColor",
    		"dayHighlightedTextColor",
    		"formattedSelected"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Datepicker> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Datepicker", $$slots, ['default']);
    	const monthSelected_handler = e => changeMonth(e.detail);
    	const incrementMonth_handler = e => incrementMonth(e.detail);
    	const dateSelected_handler = e => registerSelection(e.detail);

    	function popover_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			popover = $$value;
    			$$invalidate(6, popover);
    		});
    	}

    	function popover_1_open_binding(value) {
    		isOpen = value;
    		$$invalidate(11, isOpen);
    	}

    	function popover_1_shrink_binding(value) {
    		isClosing = value;
    		$$invalidate(12, isClosing);
    	}

    	$$self.$set = $$props => {
    		if ("format" in $$props) $$invalidate(25, format = $$props.format);
    		if ("start" in $$props) $$invalidate(3, start = $$props.start);
    		if ("end" in $$props) $$invalidate(4, end = $$props.end);
    		if ("selected" in $$props) $$invalidate(0, selected = $$props.selected);
    		if ("dateChosen" in $$props) $$invalidate(24, dateChosen = $$props.dateChosen);
    		if ("trigger" in $$props) $$invalidate(1, trigger = $$props.trigger);
    		if ("selectableCallback" in $$props) $$invalidate(26, selectableCallback = $$props.selectableCallback);
    		if ("weekStart" in $$props) $$invalidate(27, weekStart = $$props.weekStart);
    		if ("daysOfWeek" in $$props) $$invalidate(28, daysOfWeek = $$props.daysOfWeek);
    		if ("monthsOfYear" in $$props) $$invalidate(5, monthsOfYear = $$props.monthsOfYear);
    		if ("style" in $$props) $$invalidate(29, style = $$props.style);
    		if ("buttonBackgroundColor" in $$props) $$invalidate(30, buttonBackgroundColor = $$props.buttonBackgroundColor);
    		if ("buttonBorderColor" in $$props) $$invalidate(31, buttonBorderColor = $$props.buttonBorderColor);
    		if ("buttonTextColor" in $$props) $$invalidate(32, buttonTextColor = $$props.buttonTextColor);
    		if ("highlightColor" in $$props) $$invalidate(33, highlightColor = $$props.highlightColor);
    		if ("dayBackgroundColor" in $$props) $$invalidate(34, dayBackgroundColor = $$props.dayBackgroundColor);
    		if ("dayTextColor" in $$props) $$invalidate(35, dayTextColor = $$props.dayTextColor);
    		if ("dayHighlightedBackgroundColor" in $$props) $$invalidate(36, dayHighlightedBackgroundColor = $$props.dayHighlightedBackgroundColor);
    		if ("dayHighlightedTextColor" in $$props) $$invalidate(37, dayHighlightedTextColor = $$props.dayHighlightedTextColor);
    		if ("formattedSelected" in $$props) $$invalidate(2, formattedSelected = $$props.formattedSelected);
    		if ("$$scope" in $$props) $$invalidate(45, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		Month,
    		NavBar,
    		Popover,
    		getMonths,
    		formatDate,
    		internationalize,
    		keyCodes,
    		keyCodesArray,
    		onMount,
    		createEventDispatcher,
    		dispatch,
    		today,
    		popover,
    		format,
    		start,
    		end,
    		selected,
    		dateChosen,
    		trigger,
    		selectableCallback,
    		weekStart,
    		daysOfWeek,
    		monthsOfYear,
    		style,
    		buttonBackgroundColor,
    		buttonBorderColor,
    		buttonTextColor,
    		highlightColor,
    		dayBackgroundColor,
    		dayTextColor,
    		dayHighlightedBackgroundColor,
    		dayHighlightedTextColor,
    		sortedDaysOfWeek,
    		highlighted,
    		shouldShakeDate,
    		shakeHighlightTimeout,
    		month,
    		year,
    		isOpen,
    		isClosing,
    		assignmentHandler,
    		monthIndex,
    		formattedSelected,
    		changeMonth,
    		incrementMonth,
    		getDefaultHighlighted,
    		getDay,
    		incrementDayHighlighted,
    		checkIfVisibleDateIsSelectable,
    		shakeDate,
    		assignValueToTrigger,
    		registerSelection,
    		handleKeyPress,
    		registerClose,
    		close,
    		registerOpen,
    		months,
    		visibleMonth,
    		visibleMonthId,
    		lastVisibleDate,
    		firstVisibleDate,
    		canIncrementMonth,
    		canDecrementMonth,
    		wrapperStyle
    	});

    	$$self.$inject_state = $$props => {
    		if ("popover" in $$props) $$invalidate(6, popover = $$props.popover);
    		if ("format" in $$props) $$invalidate(25, format = $$props.format);
    		if ("start" in $$props) $$invalidate(3, start = $$props.start);
    		if ("end" in $$props) $$invalidate(4, end = $$props.end);
    		if ("selected" in $$props) $$invalidate(0, selected = $$props.selected);
    		if ("dateChosen" in $$props) $$invalidate(24, dateChosen = $$props.dateChosen);
    		if ("trigger" in $$props) $$invalidate(1, trigger = $$props.trigger);
    		if ("selectableCallback" in $$props) $$invalidate(26, selectableCallback = $$props.selectableCallback);
    		if ("weekStart" in $$props) $$invalidate(27, weekStart = $$props.weekStart);
    		if ("daysOfWeek" in $$props) $$invalidate(28, daysOfWeek = $$props.daysOfWeek);
    		if ("monthsOfYear" in $$props) $$invalidate(5, monthsOfYear = $$props.monthsOfYear);
    		if ("style" in $$props) $$invalidate(29, style = $$props.style);
    		if ("buttonBackgroundColor" in $$props) $$invalidate(30, buttonBackgroundColor = $$props.buttonBackgroundColor);
    		if ("buttonBorderColor" in $$props) $$invalidate(31, buttonBorderColor = $$props.buttonBorderColor);
    		if ("buttonTextColor" in $$props) $$invalidate(32, buttonTextColor = $$props.buttonTextColor);
    		if ("highlightColor" in $$props) $$invalidate(33, highlightColor = $$props.highlightColor);
    		if ("dayBackgroundColor" in $$props) $$invalidate(34, dayBackgroundColor = $$props.dayBackgroundColor);
    		if ("dayTextColor" in $$props) $$invalidate(35, dayTextColor = $$props.dayTextColor);
    		if ("dayHighlightedBackgroundColor" in $$props) $$invalidate(36, dayHighlightedBackgroundColor = $$props.dayHighlightedBackgroundColor);
    		if ("dayHighlightedTextColor" in $$props) $$invalidate(37, dayHighlightedTextColor = $$props.dayHighlightedTextColor);
    		if ("sortedDaysOfWeek" in $$props) $$invalidate(18, sortedDaysOfWeek = $$props.sortedDaysOfWeek);
    		if ("highlighted" in $$props) $$invalidate(7, highlighted = $$props.highlighted);
    		if ("shouldShakeDate" in $$props) $$invalidate(8, shouldShakeDate = $$props.shouldShakeDate);
    		if ("shakeHighlightTimeout" in $$props) shakeHighlightTimeout = $$props.shakeHighlightTimeout;
    		if ("month" in $$props) $$invalidate(9, month = $$props.month);
    		if ("year" in $$props) $$invalidate(10, year = $$props.year);
    		if ("isOpen" in $$props) $$invalidate(11, isOpen = $$props.isOpen);
    		if ("isClosing" in $$props) $$invalidate(12, isClosing = $$props.isClosing);
    		if ("monthIndex" in $$props) $$invalidate(47, monthIndex = $$props.monthIndex);
    		if ("formattedSelected" in $$props) $$invalidate(2, formattedSelected = $$props.formattedSelected);
    		if ("months" in $$props) $$invalidate(48, months = $$props.months);
    		if ("visibleMonth" in $$props) $$invalidate(13, visibleMonth = $$props.visibleMonth);
    		if ("visibleMonthId" in $$props) $$invalidate(14, visibleMonthId = $$props.visibleMonthId);
    		if ("lastVisibleDate" in $$props) lastVisibleDate = $$props.lastVisibleDate;
    		if ("firstVisibleDate" in $$props) firstVisibleDate = $$props.firstVisibleDate;
    		if ("canIncrementMonth" in $$props) $$invalidate(15, canIncrementMonth = $$props.canIncrementMonth);
    		if ("canDecrementMonth" in $$props) $$invalidate(16, canDecrementMonth = $$props.canDecrementMonth);
    		if ("wrapperStyle" in $$props) $$invalidate(17, wrapperStyle = $$props.wrapperStyle);
    	};

    	let months;
    	let visibleMonth;
    	let visibleMonthId;
    	let lastVisibleDate;
    	let firstVisibleDate;
    	let canIncrementMonth;
    	let canDecrementMonth;
    	let wrapperStyle;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*start, end, selectableCallback, weekStart*/ 201326616) {
    			 $$invalidate(48, months = getMonths(start, end, selectableCallback, weekStart));
    		}

    		if ($$self.$$.dirty[0] & /*month, year*/ 1536 | $$self.$$.dirty[1] & /*months*/ 131072) {
    			 {
    				$$invalidate(47, monthIndex = 0);

    				for (let i = 0; i < months.length; i += 1) {
    					if (months[i].month === month && months[i].year === year) {
    						$$invalidate(47, monthIndex = i);
    					}
    				}
    			}
    		}

    		if ($$self.$$.dirty[1] & /*months, monthIndex*/ 196608) {
    			 $$invalidate(13, visibleMonth = months[monthIndex]);
    		}

    		if ($$self.$$.dirty[0] & /*year, month*/ 1536) {
    			 $$invalidate(14, visibleMonthId = year + month / 100);
    		}

    		if ($$self.$$.dirty[0] & /*visibleMonth*/ 8192) {
    			 lastVisibleDate = visibleMonth.weeks[visibleMonth.weeks.length - 1].days[6].date;
    		}

    		if ($$self.$$.dirty[0] & /*visibleMonth*/ 8192) {
    			 firstVisibleDate = visibleMonth.weeks[0].days[0].date;
    		}

    		if ($$self.$$.dirty[1] & /*monthIndex, months*/ 196608) {
    			 $$invalidate(15, canIncrementMonth = monthIndex < months.length - 1);
    		}

    		if ($$self.$$.dirty[1] & /*monthIndex*/ 65536) {
    			 $$invalidate(16, canDecrementMonth = monthIndex > 0);
    		}

    		if ($$self.$$.dirty[0] & /*buttonBackgroundColor, style*/ 1610612736 | $$self.$$.dirty[1] & /*buttonBorderColor, buttonTextColor, highlightColor, dayBackgroundColor, dayTextColor, dayHighlightedBackgroundColor, dayHighlightedTextColor*/ 127) {
    			 $$invalidate(17, wrapperStyle = `
    --button-background-color: ${buttonBackgroundColor};
    --button-border-color: ${buttonBorderColor};
    --button-text-color: ${buttonTextColor};
    --highlight-color: ${highlightColor};
    --day-background-color: ${dayBackgroundColor};
    --day-text-color: ${dayTextColor};
    --day-highlighted-background-color: ${dayHighlightedBackgroundColor};
    --day-highlighted-text-color: ${dayHighlightedTextColor};
    ${style}
  `);
    		}

    		if ($$self.$$.dirty[0] & /*format, selected*/ 33554433) {
    			 {
    				$$invalidate(2, formattedSelected = typeof format === "function"
    				? format(selected)
    				: formatDate(selected, format));
    			}
    		}
    	};

    	return [
    		selected,
    		trigger,
    		formattedSelected,
    		start,
    		end,
    		monthsOfYear,
    		popover,
    		highlighted,
    		shouldShakeDate,
    		month,
    		year,
    		isOpen,
    		isClosing,
    		visibleMonth,
    		visibleMonthId,
    		canIncrementMonth,
    		canDecrementMonth,
    		wrapperStyle,
    		sortedDaysOfWeek,
    		changeMonth,
    		incrementMonth,
    		registerSelection,
    		registerClose,
    		registerOpen,
    		dateChosen,
    		format,
    		selectableCallback,
    		weekStart,
    		daysOfWeek,
    		style,
    		buttonBackgroundColor,
    		buttonBorderColor,
    		buttonTextColor,
    		highlightColor,
    		dayBackgroundColor,
    		dayTextColor,
    		dayHighlightedBackgroundColor,
    		dayHighlightedTextColor,
    		$$slots,
    		monthSelected_handler,
    		incrementMonth_handler,
    		dateSelected_handler,
    		popover_1_binding,
    		popover_1_open_binding,
    		popover_1_shrink_binding,
    		$$scope
    	];
    }

    class Datepicker extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document_1$1.getElementById("svelte-1lorc63-style")) add_css$4();

    		init(
    			this,
    			options,
    			instance$4,
    			create_fragment$4,
    			safe_not_equal,
    			{
    				format: 25,
    				start: 3,
    				end: 4,
    				selected: 0,
    				dateChosen: 24,
    				trigger: 1,
    				selectableCallback: 26,
    				weekStart: 27,
    				daysOfWeek: 28,
    				monthsOfYear: 5,
    				style: 29,
    				buttonBackgroundColor: 30,
    				buttonBorderColor: 31,
    				buttonTextColor: 32,
    				highlightColor: 33,
    				dayBackgroundColor: 34,
    				dayTextColor: 35,
    				dayHighlightedBackgroundColor: 36,
    				dayHighlightedTextColor: 37,
    				formattedSelected: 2
    			},
    			[-1, -1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Datepicker",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*formattedSelected*/ ctx[2] === undefined && !("formattedSelected" in props)) {
    			console.warn("<Datepicker> was created without expected prop 'formattedSelected'");
    		}
    	}

    	get format() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set format(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get start() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set start(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get end() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set end(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selected() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selected(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dateChosen() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dateChosen(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get trigger() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set trigger(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectableCallback() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectableCallback(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get weekStart() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set weekStart(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get daysOfWeek() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set daysOfWeek(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get monthsOfYear() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set monthsOfYear(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get style() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set style(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get buttonBackgroundColor() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set buttonBackgroundColor(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get buttonBorderColor() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set buttonBorderColor(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get buttonTextColor() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set buttonTextColor(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get highlightColor() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set highlightColor(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dayBackgroundColor() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dayBackgroundColor(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dayTextColor() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dayTextColor(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dayHighlightedBackgroundColor() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dayHighlightedBackgroundColor(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dayHighlightedTextColor() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dayHighlightedTextColor(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get formattedSelected() {
    		throw new Error("<Datepicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set formattedSelected(value) {
    		throw new Error("<Datepicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const dateFr = {
        mois: [
        ["janvier", "jan."],
        ["février", "fév."],
        ["mars", "mars"],
        ["avril", "avr."],
        ["mai", "mai"],
        ["juin", "juin"],
        ["juillet", "juil."],
        ["août", "août"],
        ["septembre", "sept."],
        ["octobre", "oct."],
        ["novembre", "nov."],
        ["décembre", "déc."]
    ],
    jours: [
        ["dimanche", "dim."],
        ["lundi", "lun."],
        ["mardi", "mar."],
        ["mercredi", "mer."],
        ["jeudi", "jeu."],
        ["vendredi", "ven."],
        ["samedi", "sam."]
    ]
    };

    function getJourSemaine(value) {
        var d = new Date(value);
        return d.getDay()
    }

    function horaireFr(horaire) {
        let h = horaire.split(":");
        return h[0] + 'h' + h[1]
    }

    /* node_modules/svelte-fa/src/fa.svelte generated by Svelte v3.24.0 */

    const file$5 = "node_modules/svelte-fa/src/fa.svelte";

    // (104:0) {#if i[4]}
    function create_if_block$1(ctx) {
    	let svg;
    	let g1;
    	let g0;
    	let svg_viewBox_value;

    	function select_block_type(ctx, dirty) {
    		if (typeof /*i*/ ctx[8][4] == "string") return create_if_block_1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			if_block.c();
    			attr_dev(g0, "transform", /*transform*/ ctx[10]);
    			add_location(g0, file$5, 116, 6, 2052);
    			attr_dev(g1, "transform", "translate(256 256)");
    			add_location(g1, file$5, 113, 4, 2000);
    			attr_dev(svg, "id", /*id*/ ctx[1]);
    			attr_dev(svg, "class", /*clazz*/ ctx[0]);
    			attr_dev(svg, "style", /*s*/ ctx[9]);
    			attr_dev(svg, "viewBox", svg_viewBox_value = `0 0 ${/*i*/ ctx[8][0]} ${/*i*/ ctx[8][1]}`);
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "role", "img");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			add_location(svg, file$5, 104, 2, 1830);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, g1);
    			append_dev(g1, g0);
    			if_block.m(g0, null);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(g0, null);
    				}
    			}

    			if (dirty & /*transform*/ 1024) {
    				attr_dev(g0, "transform", /*transform*/ ctx[10]);
    			}

    			if (dirty & /*id*/ 2) {
    				attr_dev(svg, "id", /*id*/ ctx[1]);
    			}

    			if (dirty & /*clazz*/ 1) {
    				attr_dev(svg, "class", /*clazz*/ ctx[0]);
    			}

    			if (dirty & /*s*/ 512) {
    				attr_dev(svg, "style", /*s*/ ctx[9]);
    			}

    			if (dirty & /*i*/ 256 && svg_viewBox_value !== (svg_viewBox_value = `0 0 ${/*i*/ ctx[8][0]} ${/*i*/ ctx[8][1]}`)) {
    				attr_dev(svg, "viewBox", svg_viewBox_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(104:0) {#if i[4]}",
    		ctx
    	});

    	return block;
    }

    // (124:8) {:else}
    function create_else_block(ctx) {
    	let path0;
    	let path0_d_value;
    	let path0_fill_value;
    	let path0_fill_opacity_value;
    	let path1;
    	let path1_d_value;
    	let path1_fill_value;
    	let path1_fill_opacity_value;

    	const block = {
    		c: function create() {
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			attr_dev(path0, "d", path0_d_value = /*i*/ ctx[8][4][0]);
    			attr_dev(path0, "fill", path0_fill_value = /*secondaryColor*/ ctx[4] || /*color*/ ctx[2] || "currentColor");

    			attr_dev(path0, "fill-opacity", path0_fill_opacity_value = /*swapOpacity*/ ctx[7] != false
    			? /*primaryOpacity*/ ctx[5]
    			: /*secondaryOpacity*/ ctx[6]);

    			attr_dev(path0, "transform", "translate(-256 -256)");
    			add_location(path0, file$5, 124, 10, 2286);
    			attr_dev(path1, "d", path1_d_value = /*i*/ ctx[8][4][1]);
    			attr_dev(path1, "fill", path1_fill_value = /*primaryColor*/ ctx[3] || /*color*/ ctx[2] || "currentColor");

    			attr_dev(path1, "fill-opacity", path1_fill_opacity_value = /*swapOpacity*/ ctx[7] != false
    			? /*secondaryOpacity*/ ctx[6]
    			: /*primaryOpacity*/ ctx[5]);

    			attr_dev(path1, "transform", "translate(-256 -256)");
    			add_location(path1, file$5, 130, 10, 2529);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path0, anchor);
    			insert_dev(target, path1, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*i*/ 256 && path0_d_value !== (path0_d_value = /*i*/ ctx[8][4][0])) {
    				attr_dev(path0, "d", path0_d_value);
    			}

    			if (dirty & /*secondaryColor, color*/ 20 && path0_fill_value !== (path0_fill_value = /*secondaryColor*/ ctx[4] || /*color*/ ctx[2] || "currentColor")) {
    				attr_dev(path0, "fill", path0_fill_value);
    			}

    			if (dirty & /*swapOpacity, primaryOpacity, secondaryOpacity*/ 224 && path0_fill_opacity_value !== (path0_fill_opacity_value = /*swapOpacity*/ ctx[7] != false
    			? /*primaryOpacity*/ ctx[5]
    			: /*secondaryOpacity*/ ctx[6])) {
    				attr_dev(path0, "fill-opacity", path0_fill_opacity_value);
    			}

    			if (dirty & /*i*/ 256 && path1_d_value !== (path1_d_value = /*i*/ ctx[8][4][1])) {
    				attr_dev(path1, "d", path1_d_value);
    			}

    			if (dirty & /*primaryColor, color*/ 12 && path1_fill_value !== (path1_fill_value = /*primaryColor*/ ctx[3] || /*color*/ ctx[2] || "currentColor")) {
    				attr_dev(path1, "fill", path1_fill_value);
    			}

    			if (dirty & /*swapOpacity, secondaryOpacity, primaryOpacity*/ 224 && path1_fill_opacity_value !== (path1_fill_opacity_value = /*swapOpacity*/ ctx[7] != false
    			? /*secondaryOpacity*/ ctx[6]
    			: /*primaryOpacity*/ ctx[5])) {
    				attr_dev(path1, "fill-opacity", path1_fill_opacity_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path0);
    			if (detaching) detach_dev(path1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(124:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (118:8) {#if typeof i[4] == 'string'}
    function create_if_block_1(ctx) {
    	let path;
    	let path_d_value;
    	let path_fill_value;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", path_d_value = /*i*/ ctx[8][4]);
    			attr_dev(path, "fill", path_fill_value = /*color*/ ctx[2] || /*primaryColor*/ ctx[3] || "currentColor");
    			attr_dev(path, "transform", "translate(-256 -256)");
    			add_location(path, file$5, 118, 10, 2116);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*i*/ 256 && path_d_value !== (path_d_value = /*i*/ ctx[8][4])) {
    				attr_dev(path, "d", path_d_value);
    			}

    			if (dirty & /*color, primaryColor*/ 12 && path_fill_value !== (path_fill_value = /*color*/ ctx[2] || /*primaryColor*/ ctx[3] || "currentColor")) {
    				attr_dev(path, "fill", path_fill_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(118:8) {#if typeof i[4] == 'string'}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let if_block_anchor;
    	let if_block = /*i*/ ctx[8][4] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*i*/ ctx[8][4]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { class: clazz = "" } = $$props;
    	let { id = "" } = $$props;
    	let { style = "" } = $$props;
    	let { icon } = $$props;
    	let { fw = false } = $$props;
    	let { flip = false } = $$props;
    	let { pull = false } = $$props;
    	let { rotate = false } = $$props;
    	let { size = false } = $$props;
    	let { color = "" } = $$props;
    	let { primaryColor = "" } = $$props;
    	let { secondaryColor = "" } = $$props;
    	let { primaryOpacity = 1 } = $$props;
    	let { secondaryOpacity = 0.4 } = $$props;
    	let { swapOpacity = false } = $$props;
    	let i;
    	let s;
    	let transform;

    	const writable_props = [
    		"class",
    		"id",
    		"style",
    		"icon",
    		"fw",
    		"flip",
    		"pull",
    		"rotate",
    		"size",
    		"color",
    		"primaryColor",
    		"secondaryColor",
    		"primaryOpacity",
    		"secondaryOpacity",
    		"swapOpacity"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Fa> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Fa", $$slots, []);

    	$$self.$set = $$props => {
    		if ("class" in $$props) $$invalidate(0, clazz = $$props.class);
    		if ("id" in $$props) $$invalidate(1, id = $$props.id);
    		if ("style" in $$props) $$invalidate(11, style = $$props.style);
    		if ("icon" in $$props) $$invalidate(12, icon = $$props.icon);
    		if ("fw" in $$props) $$invalidate(13, fw = $$props.fw);
    		if ("flip" in $$props) $$invalidate(14, flip = $$props.flip);
    		if ("pull" in $$props) $$invalidate(15, pull = $$props.pull);
    		if ("rotate" in $$props) $$invalidate(16, rotate = $$props.rotate);
    		if ("size" in $$props) $$invalidate(17, size = $$props.size);
    		if ("color" in $$props) $$invalidate(2, color = $$props.color);
    		if ("primaryColor" in $$props) $$invalidate(3, primaryColor = $$props.primaryColor);
    		if ("secondaryColor" in $$props) $$invalidate(4, secondaryColor = $$props.secondaryColor);
    		if ("primaryOpacity" in $$props) $$invalidate(5, primaryOpacity = $$props.primaryOpacity);
    		if ("secondaryOpacity" in $$props) $$invalidate(6, secondaryOpacity = $$props.secondaryOpacity);
    		if ("swapOpacity" in $$props) $$invalidate(7, swapOpacity = $$props.swapOpacity);
    	};

    	$$self.$capture_state = () => ({
    		clazz,
    		id,
    		style,
    		icon,
    		fw,
    		flip,
    		pull,
    		rotate,
    		size,
    		color,
    		primaryColor,
    		secondaryColor,
    		primaryOpacity,
    		secondaryOpacity,
    		swapOpacity,
    		i,
    		s,
    		transform
    	});

    	$$self.$inject_state = $$props => {
    		if ("clazz" in $$props) $$invalidate(0, clazz = $$props.clazz);
    		if ("id" in $$props) $$invalidate(1, id = $$props.id);
    		if ("style" in $$props) $$invalidate(11, style = $$props.style);
    		if ("icon" in $$props) $$invalidate(12, icon = $$props.icon);
    		if ("fw" in $$props) $$invalidate(13, fw = $$props.fw);
    		if ("flip" in $$props) $$invalidate(14, flip = $$props.flip);
    		if ("pull" in $$props) $$invalidate(15, pull = $$props.pull);
    		if ("rotate" in $$props) $$invalidate(16, rotate = $$props.rotate);
    		if ("size" in $$props) $$invalidate(17, size = $$props.size);
    		if ("color" in $$props) $$invalidate(2, color = $$props.color);
    		if ("primaryColor" in $$props) $$invalidate(3, primaryColor = $$props.primaryColor);
    		if ("secondaryColor" in $$props) $$invalidate(4, secondaryColor = $$props.secondaryColor);
    		if ("primaryOpacity" in $$props) $$invalidate(5, primaryOpacity = $$props.primaryOpacity);
    		if ("secondaryOpacity" in $$props) $$invalidate(6, secondaryOpacity = $$props.secondaryOpacity);
    		if ("swapOpacity" in $$props) $$invalidate(7, swapOpacity = $$props.swapOpacity);
    		if ("i" in $$props) $$invalidate(8, i = $$props.i);
    		if ("s" in $$props) $$invalidate(9, s = $$props.s);
    		if ("transform" in $$props) $$invalidate(10, transform = $$props.transform);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*icon*/ 4096) {
    			 $$invalidate(8, i = icon && icon.icon || [0, 0, "", [], ""]);
    		}

    		if ($$self.$$.dirty & /*fw, pull, size, style*/ 174080) {
    			 {
    				let float;
    				let width;
    				const height = "1em";
    				let lineHeight;
    				let fontSize;
    				let textAlign;
    				let verticalAlign = "-.125em";
    				const overflow = "visible";

    				if (fw) {
    					textAlign = "center";
    					width = "1.25em";
    				}

    				if (pull) {
    					float = pull;
    				}

    				if (size) {
    					if (size == "lg") {
    						fontSize = "1.33333em";
    						lineHeight = ".75em";
    						verticalAlign = "-.225em";
    					} else if (size == "xs") {
    						fontSize = ".75em";
    					} else if (size == "sm") {
    						fontSize = ".875em";
    					} else {
    						fontSize = size.replace("x", "em");
    					}
    				}

    				const styleObj = {
    					float,
    					width,
    					height,
    					"line-height": lineHeight,
    					"font-size": fontSize,
    					"text-align": textAlign,
    					"vertical-align": verticalAlign,
    					overflow
    				};

    				let styleStr = "";

    				for (const prop in styleObj) {
    					if (styleObj[prop]) {
    						styleStr += `${prop}:${styleObj[prop]};`;
    					}
    				}

    				$$invalidate(9, s = styleStr + style);
    			}
    		}

    		if ($$self.$$.dirty & /*flip, rotate*/ 81920) {
    			 {
    				let t = "";

    				if (flip) {
    					let flipX = 1;
    					let flipY = 1;

    					if (flip == "horizontal") {
    						flipX = -1;
    					} else if (flip == "vertical") {
    						flipY = -1;
    					} else {
    						flipX = flipY = -1;
    					}

    					t += ` scale(${flipX} ${flipY})`;
    				}

    				if (rotate) {
    					t += ` rotate(${rotate} 0 0)`;
    				}

    				$$invalidate(10, transform = t);
    			}
    		}
    	};

    	return [
    		clazz,
    		id,
    		color,
    		primaryColor,
    		secondaryColor,
    		primaryOpacity,
    		secondaryOpacity,
    		swapOpacity,
    		i,
    		s,
    		transform,
    		style,
    		icon,
    		fw,
    		flip,
    		pull,
    		rotate,
    		size
    	];
    }

    class Fa extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			class: 0,
    			id: 1,
    			style: 11,
    			icon: 12,
    			fw: 13,
    			flip: 14,
    			pull: 15,
    			rotate: 16,
    			size: 17,
    			color: 2,
    			primaryColor: 3,
    			secondaryColor: 4,
    			primaryOpacity: 5,
    			secondaryOpacity: 6,
    			swapOpacity: 7
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Fa",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*icon*/ ctx[12] === undefined && !("icon" in props)) {
    			console.warn("<Fa> was created without expected prop 'icon'");
    		}
    	}

    	get class() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get style() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set style(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fw() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fw(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get flip() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set flip(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pull() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pull(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get rotate() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set rotate(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get size() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get primaryColor() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set primaryColor(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get secondaryColor() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set secondaryColor(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get primaryOpacity() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set primaryOpacity(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get secondaryOpacity() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set secondaryOpacity(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get swapOpacity() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set swapOpacity(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var faCheckSquare = {
      prefix: 'far',
      iconName: 'check-square',
      icon: [448, 512, [], "f14a", "M400 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V80c0-26.51-21.49-48-48-48zm0 400H48V80h352v352zm-35.864-241.724L191.547 361.48c-4.705 4.667-12.303 4.637-16.97-.068l-90.781-91.516c-4.667-4.705-4.637-12.303.069-16.971l22.719-22.536c4.705-4.667 12.303-4.637 16.97.069l59.792 60.277 141.352-140.216c4.705-4.667 12.303-4.637 16.97.068l22.536 22.718c4.667 4.706 4.637 12.304-.068 16.971z"]
    };
    var faCircle = {
      prefix: 'far',
      iconName: 'circle',
      icon: [512, 512, [], "f111", "M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200z"]
    };
    var faDotCircle = {
      prefix: 'far',
      iconName: 'dot-circle',
      icon: [512, 512, [], "f192", "M256 56c110.532 0 200 89.451 200 200 0 110.532-89.451 200-200 200-110.532 0-200-89.451-200-200 0-110.532 89.451-200 200-200m0-48C119.033 8 8 119.033 8 256s111.033 248 248 248 248-111.033 248-248S392.967 8 256 8zm0 168c-44.183 0-80 35.817-80 80s35.817 80 80 80 80-35.817 80-80-35.817-80-80-80z"]
    };
    var faSquare = {
      prefix: 'far',
      iconName: 'square',
      icon: [448, 512, [], "f0c8", "M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zm-6 400H54c-3.3 0-6-2.7-6-6V86c0-3.3 2.7-6 6-6h340c3.3 0 6 2.7 6 6v340c0 3.3-2.7 6-6 6z"]
    };

    /* src/svelte/components/radioButtons.svelte generated by Svelte v3.24.0 */
    const file$6 = "src/svelte/components/radioButtons.svelte";

    // (35:8) {:else}
    function create_else_block_1(ctx) {
    	let div0;
    	let t0;
    	let t1;
    	let div1;
    	let current_block_type_index;
    	let if_block;
    	let t2;
    	let input;
    	let input_selected_value;
    	let current;
    	const if_block_creators = [create_if_block_2, create_else_block_2];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*selected*/ ctx[0] === /*value*/ ctx[3]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			t0 = text(/*label*/ ctx[2]);
    			t1 = space();
    			div1 = element("div");
    			if_block.c();
    			t2 = space();
    			input = element("input");
    			attr_dev(div0, "class", "mr-2 text-base font-medium");
    			add_location(div0, file$6, 35, 12, 1163);
    			attr_dev(div1, "class", "");
    			add_location(div1, file$6, 38, 12, 1259);
    			attr_dev(input, "aria-label", /*label*/ ctx[2]);
    			attr_dev(input, "class", "hidden");
    			attr_dev(input, "type", "radio");
    			attr_dev(input, "role", "radio");
    			attr_dev(input, "name", /*name*/ ctx[1]);
    			attr_dev(input, "selected", input_selected_value = /*selected*/ ctx[0] === /*value*/ ctx[3]);
    			add_location(input, file$6, 45, 16, 1505);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, t0);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div1, anchor);
    			if_blocks[current_block_type_index].m(div1, null);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, input, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*label*/ 4) set_data_dev(t0, /*label*/ ctx[2]);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div1, null);
    			}

    			if (!current || dirty & /*label*/ 4) {
    				attr_dev(input, "aria-label", /*label*/ ctx[2]);
    			}

    			if (!current || dirty & /*name*/ 2) {
    				attr_dev(input, "name", /*name*/ ctx[1]);
    			}

    			if (!current || dirty & /*selected, value*/ 9 && input_selected_value !== (input_selected_value = /*selected*/ ctx[0] === /*value*/ ctx[3])) {
    				attr_dev(input, "selected", input_selected_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div1);
    			if_blocks[current_block_type_index].d();
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(input);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(35:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (17:8) {#if mettreApres}
    function create_if_block$2(ctx) {
    	let input;
    	let input_selected_value;
    	let t0;
    	let div0;
    	let current_block_type_index;
    	let if_block;
    	let t1;
    	let div1;
    	let t2;
    	let current;
    	const if_block_creators = [create_if_block_1$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*selected*/ ctx[0] === /*value*/ ctx[3]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			input = element("input");
    			t0 = space();
    			div0 = element("div");
    			if_block.c();
    			t1 = space();
    			div1 = element("div");
    			t2 = text(/*label*/ ctx[2]);
    			attr_dev(input, "aria-label", /*label*/ ctx[2]);
    			attr_dev(input, "class", "hidden");
    			attr_dev(input, "type", "radio");
    			attr_dev(input, "role", "radio");
    			attr_dev(input, "name", /*name*/ ctx[1]);
    			attr_dev(input, "selected", input_selected_value = /*selected*/ ctx[0] === /*value*/ ctx[3]);
    			add_location(input, file$6, 17, 16, 578);
    			add_location(div0, file$6, 24, 12, 817);
    			attr_dev(div1, "class", "ml-2 text-base font-medium");
    			add_location(div1, file$6, 31, 12, 1051);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div0, anchor);
    			if_blocks[current_block_type_index].m(div0, null);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, t2);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*label*/ 4) {
    				attr_dev(input, "aria-label", /*label*/ ctx[2]);
    			}

    			if (!current || dirty & /*name*/ 2) {
    				attr_dev(input, "name", /*name*/ ctx[1]);
    			}

    			if (!current || dirty & /*selected, value*/ 9 && input_selected_value !== (input_selected_value = /*selected*/ ctx[0] === /*value*/ ctx[3])) {
    				attr_dev(input, "selected", input_selected_value);
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div0, null);
    			}

    			if (!current || dirty & /*label*/ 4) set_data_dev(t2, /*label*/ ctx[2]);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div0);
    			if_blocks[current_block_type_index].d();
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(17:8) {#if mettreApres}",
    		ctx
    	});

    	return block;
    }

    // (42:16) {:else}
    function create_else_block_2(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: { icon: faCircle, size: "lg" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_2.name,
    		type: "else",
    		source: "(42:16) {:else}",
    		ctx
    	});

    	return block;
    }

    // (40:16) {#if selected === value}
    function create_if_block_2(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: { icon: faDotCircle, size: "lg" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(40:16) {#if selected === value}",
    		ctx
    	});

    	return block;
    }

    // (28:16) {:else}
    function create_else_block$1(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: { icon: faCircle, size: "lg" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(28:16) {:else}",
    		ctx
    	});

    	return block;
    }

    // (26:16) {#if selected === value}
    function create_if_block_1$1(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: { icon: faDotCircle, size: "lg" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(26:16) {#if selected === value}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let div;
    	let label_1;
    	let current_block_type_index;
    	let if_block;
    	let label_1_class_value;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block$2, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*mettreApres*/ ctx[4]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			label_1 = element("label");
    			if_block.c();
    			attr_dev(label_1, "class", label_1_class_value = "flex flex-row items-center " + /*cbClasses*/ ctx[5]);
    			add_location(label_1, file$6, 15, 4, 478);
    			attr_dev(div, "class", "cursor-pointer mx-2");
    			add_location(div, file$6, 14, 0, 407);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, label_1);
    			if_blocks[current_block_type_index].m(label_1, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*click_handler*/ ctx[6], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(label_1, null);
    			}

    			if (!current || dirty & /*cbClasses*/ 32 && label_1_class_value !== (label_1_class_value = "flex flex-row items-center " + /*cbClasses*/ ctx[5])) {
    				attr_dev(label_1, "class", label_1_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { name = "" } = $$props;
    	let { label = "" } = $$props;
    	let { selected = "" } = $$props;
    	let { value = "" } = $$props;
    	let { mettreApres = false } = $$props;
    	let { cbClasses = "" } = $$props;
    	const writable_props = ["name", "label", "selected", "value", "mettreApres", "cbClasses"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<RadioButtons> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("RadioButtons", $$slots, []);

    	const click_handler = () => {
    		$$invalidate(0, selected = value);
    	};

    	$$self.$set = $$props => {
    		if ("name" in $$props) $$invalidate(1, name = $$props.name);
    		if ("label" in $$props) $$invalidate(2, label = $$props.label);
    		if ("selected" in $$props) $$invalidate(0, selected = $$props.selected);
    		if ("value" in $$props) $$invalidate(3, value = $$props.value);
    		if ("mettreApres" in $$props) $$invalidate(4, mettreApres = $$props.mettreApres);
    		if ("cbClasses" in $$props) $$invalidate(5, cbClasses = $$props.cbClasses);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		Fa,
    		faCircle,
    		faDotCircle,
    		name,
    		label,
    		selected,
    		value,
    		mettreApres,
    		cbClasses
    	});

    	$$self.$inject_state = $$props => {
    		if ("name" in $$props) $$invalidate(1, name = $$props.name);
    		if ("label" in $$props) $$invalidate(2, label = $$props.label);
    		if ("selected" in $$props) $$invalidate(0, selected = $$props.selected);
    		if ("value" in $$props) $$invalidate(3, value = $$props.value);
    		if ("mettreApres" in $$props) $$invalidate(4, mettreApres = $$props.mettreApres);
    		if ("cbClasses" in $$props) $$invalidate(5, cbClasses = $$props.cbClasses);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [selected, name, label, value, mettreApres, cbClasses, click_handler];
    }

    class RadioButtons extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			name: 1,
    			label: 2,
    			selected: 0,
    			value: 3,
    			mettreApres: 4,
    			cbClasses: 5
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "RadioButtons",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get name() {
    		throw new Error("<RadioButtons>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<RadioButtons>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<RadioButtons>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<RadioButtons>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selected() {
    		throw new Error("<RadioButtons>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selected(value) {
    		throw new Error("<RadioButtons>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<RadioButtons>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<RadioButtons>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get mettreApres() {
    		throw new Error("<RadioButtons>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set mettreApres(value) {
    		throw new Error("<RadioButtons>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get cbClasses() {
    		throw new Error("<RadioButtons>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set cbClasses(value) {
    		throw new Error("<RadioButtons>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/svelte/components/Checkbox.svelte generated by Svelte v3.24.0 */
    const file$7 = "src/svelte/components/Checkbox.svelte";

    // (42:8) {:else}
    function create_else_block_1$1(ctx) {
    	let div0;
    	let current_block_type_index;
    	let if_block;
    	let t0;
    	let div1;
    	let t1;
    	let t2;
    	let input;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block_2$1, create_else_block_2$1];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*checked*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			if_block.c();
    			t0 = space();
    			div1 = element("div");
    			t1 = text(/*label*/ ctx[1]);
    			t2 = space();
    			input = element("input");
    			attr_dev(div0, "class", "mr-1");
    			add_location(div0, file$7, 42, 12, 1141);
    			attr_dev(div1, "class", "ml-1 text-base font-medium");
    			add_location(div1, file$7, 49, 12, 1378);
    			attr_dev(input, "class", "hidden");
    			attr_dev(input, "type", "checkbox");
    			input.disabled = /*disabled*/ ctx[3];
    			add_location(input, file$7, 52, 12, 1474);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			if_blocks[current_block_type_index].m(div0, null);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, t1);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, input, anchor);
    			input.checked = /*checked*/ ctx[0];
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(input, "change", /*input_change_handler_1*/ ctx[9]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div0, null);
    			}

    			if (!current || dirty & /*label*/ 2) set_data_dev(t1, /*label*/ ctx[1]);

    			if (!current || dirty & /*disabled*/ 8) {
    				prop_dev(input, "disabled", /*disabled*/ ctx[3]);
    			}

    			if (dirty & /*checked*/ 1) {
    				input.checked = /*checked*/ ctx[0];
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if_blocks[current_block_type_index].d();
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(input);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1$1.name,
    		type: "else",
    		source: "(42:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (30:8) {#if mettreApres}
    function create_if_block$3(ctx) {
    	let input;
    	let t0;
    	let div0;
    	let current_block_type_index;
    	let if_block;
    	let t1;
    	let div1;
    	let t2;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block_1$2, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*checked*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			input = element("input");
    			t0 = space();
    			div0 = element("div");
    			if_block.c();
    			t1 = space();
    			div1 = element("div");
    			t2 = text(/*label*/ ctx[1]);
    			attr_dev(input, "class", "hidden");
    			attr_dev(input, "type", "checkbox");
    			input.disabled = /*disabled*/ ctx[3];
    			add_location(input, file$7, 30, 12, 719);
    			add_location(div0, file$7, 31, 12, 804);
    			attr_dev(div1, "class", "ml-3 text-base font-medium");
    			add_location(div1, file$7, 38, 12, 1029);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			input.checked = /*checked*/ ctx[0];
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div0, anchor);
    			if_blocks[current_block_type_index].m(div0, null);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, t2);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(input, "change", /*input_change_handler*/ ctx[8]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*disabled*/ 8) {
    				prop_dev(input, "disabled", /*disabled*/ ctx[3]);
    			}

    			if (dirty & /*checked*/ 1) {
    				input.checked = /*checked*/ ctx[0];
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div0, null);
    			}

    			if (!current || dirty & /*label*/ 2) set_data_dev(t2, /*label*/ ctx[1]);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div0);
    			if_blocks[current_block_type_index].d();
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(30:8) {#if mettreApres}",
    		ctx
    	});

    	return block;
    }

    // (46:16) {:else}
    function create_else_block_2$1(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: { icon: faSquare, size: "lg" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_2$1.name,
    		type: "else",
    		source: "(46:16) {:else}",
    		ctx
    	});

    	return block;
    }

    // (44:16) {#if checked}
    function create_if_block_2$1(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: { icon: faCheckSquare, size: "lg" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(44:16) {#if checked}",
    		ctx
    	});

    	return block;
    }

    // (35:16) {:else}
    function create_else_block$2(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: { icon: faSquare, size: "lg" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(35:16) {:else}",
    		ctx
    	});

    	return block;
    }

    // (33:16) {#if checked}
    function create_if_block_1$2(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: { icon: faCheckSquare, size: "lg" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(33:16) {#if checked}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let div;
    	let label_1;
    	let current_block_type_index;
    	let if_block;
    	let label_1_class_value;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block$3, create_else_block_1$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*mettreApres*/ ctx[5]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			label_1 = element("label");
    			if_block.c();
    			attr_dev(label_1, "class", label_1_class_value = "flex flex-row items-center " + /*cbClasses*/ ctx[2] + /*opacity*/ ctx[4]);
    			add_location(label_1, file$7, 28, 4, 613);
    			add_location(div, file$7, 27, 0, 586);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, label_1);
    			if_blocks[current_block_type_index].m(label_1, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*check*/ ctx[6], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if_block.p(ctx, dirty);

    			if (!current || dirty & /*cbClasses, opacity*/ 20 && label_1_class_value !== (label_1_class_value = "flex flex-row items-center " + /*cbClasses*/ ctx[2] + /*opacity*/ ctx[4])) {
    				attr_dev(label_1, "class", label_1_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { checked = false } = $$props;
    	let { label = "" } = $$props;
    	let { position = "après" } = $$props;
    	let { cbClasses = "" } = $$props;
    	let { disabled = false } = $$props;
    	let opacity = "";
    	let mettreApres = position === "après";

    	function check() {
    		if (!disabled) {
    			dispatch("change", !checked);
    		}
    	}

    	const writable_props = ["checked", "label", "position", "cbClasses", "disabled"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Checkbox> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Checkbox", $$slots, []);

    	function input_change_handler() {
    		checked = this.checked;
    		$$invalidate(0, checked);
    	}

    	function input_change_handler_1() {
    		checked = this.checked;
    		$$invalidate(0, checked);
    	}

    	$$self.$set = $$props => {
    		if ("checked" in $$props) $$invalidate(0, checked = $$props.checked);
    		if ("label" in $$props) $$invalidate(1, label = $$props.label);
    		if ("position" in $$props) $$invalidate(7, position = $$props.position);
    		if ("cbClasses" in $$props) $$invalidate(2, cbClasses = $$props.cbClasses);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		Fa,
    		faSquare,
    		faCheckSquare,
    		checked,
    		label,
    		position,
    		cbClasses,
    		disabled,
    		opacity,
    		mettreApres,
    		check
    	});

    	$$self.$inject_state = $$props => {
    		if ("checked" in $$props) $$invalidate(0, checked = $$props.checked);
    		if ("label" in $$props) $$invalidate(1, label = $$props.label);
    		if ("position" in $$props) $$invalidate(7, position = $$props.position);
    		if ("cbClasses" in $$props) $$invalidate(2, cbClasses = $$props.cbClasses);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    		if ("opacity" in $$props) $$invalidate(4, opacity = $$props.opacity);
    		if ("mettreApres" in $$props) $$invalidate(5, mettreApres = $$props.mettreApres);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*disabled*/ 8) {
    			 if (disabled) {
    				$$invalidate(4, opacity = " opacity-50");
    			} else {
    				$$invalidate(4, opacity = "");
    			}
    		}
    	};

    	return [
    		checked,
    		label,
    		cbClasses,
    		disabled,
    		opacity,
    		mettreApres,
    		check,
    		position,
    		input_change_handler,
    		input_change_handler_1
    	];
    }

    class Checkbox extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {
    			checked: 0,
    			label: 1,
    			position: 7,
    			cbClasses: 2,
    			disabled: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Checkbox",
    			options,
    			id: create_fragment$7.name
    		});
    	}

    	get checked() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set checked(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get position() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set position(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get cbClasses() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set cbClasses(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var faCheck = {
      prefix: 'fas',
      iconName: 'check',
      icon: [512, 512, [], "f00c", "M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"]
    };
    var faTimes = {
      prefix: 'fas',
      iconName: 'times',
      icon: [352, 512, [], "f00d", "M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"]
    };

    let couleur = [];
    couleur['LaBonneFabrique'] = '#e32e39';
    couleur['LaBrasserie'] = '#fcc62d';
    couleur['LespaceCoworking'] = '#4bbcc4';
    couleur['Latelier'] = '#ee732e';
    couleur['jardinPartage'] = '#93c021';
    couleur['Autres'] = '#5e4b99';

    const couleur2 = [];
    couleur2['rouge'] = { numCouleur: '#e32e39', espace: 'rencontre', variante: 'rouge', classText: 'text-rougeLBF' };
    couleur2['jaune'] = { numCouleur: '#fcc62d', espace: 'brasserie', variante: 'jaune', classText: 'text-jauneLBF' };
    couleur2['bleu'] = { numCouleur: '#4bbcc4', espace: 'coworking', variante: 'bleu', classText: 'text-bleuLBF' };
    couleur2['orange'] = { numCouleur: '#ee732e', espace: 'atelier', variante: 'orange', classText: 'text-orangeLBF' };
    couleur2['vert'] = { numCouleur: '#93c021', espace: 'jardin', variante: 'vert', classText: 'text-vertLBF' };
    couleur2['violet'] = { numCouleur: '#5e4b99', espace: 'autre', variante: 'violet', classText: 'text-violetLBF' };
    const tableCouleursLBF = couleur2;

    const couleur3 = [];
    couleur3[0] = { numCouleur: '#e32e39', espace: 'rencontre', variante: 'rouge', classText: 'text-rougeLBF', classBG: 'bg-rougeLBF' };
    couleur3[1] = { numCouleur: '#fcc62d', espace: 'brasserie', variante: 'jaune', classText: 'text-jauneLBF', classBG: 'bg-jauneLBF' };
    couleur3[2] = { numCouleur: '#4bbcc4', espace: 'coworking', variante: 'bleu', classText: 'text-bleuLBF', classBG: 'bg-bleuLBF' };
    couleur3[3] = { numCouleur: '#ee732e', espace: 'atelier', variante: 'orange', classText: 'text-orangeLBF', classBG: 'bg-orangeLBF' };
    couleur3[4] = { numCouleur: '#93c021', espace: 'jardin', variante: 'vert', classText: 'text-vertLBF', classBG: 'bg-vertLBF' };
    couleur3[5] = { numCouleur: '#5e4b99', espace: 'autre', variante: 'violet', classText: 'text-violetLBF', classBG: 'bg-violetLBF' };

    async function requeteGraphQL(query, variables) {
        var body = {query: query};
        if (variables!== undefined) {
            body.variables = variables;
        }
        const entetes = {'Content-Type': 'application/json'};
        var options = {
            method: "POST",
            headers: entetes,
            cache: "no-cache",
            body: JSON.stringify(body)
        };
        return fetch("https://graphql.labonnefabrique.fr/apollo", options)
            .then((retourFetch)=>{
                return retourFetch.json()
            })
            .then((retourJSON)=>{
                console.log('retourJSON', retourJSON);
                return retourJSON.data
            }).catch((error)=>{console.log('erreur', error);})
        }

    async function userData(email) {
        const query = `
            query userData($email:String!) {userData(email:$email){userData}}
        `;
        const variables = {
            email: email
        };
        return requeteGraphQL(query, variables)
            .then((resultats)=> {
                let retour = JSON.parse(resultats.userData.userData);
                let now = new Date();
                let limiteAbonnement = new Date(retour.abonnement);
                retour.estAbonne = now <= limiteAbonnement;
                return retour
            })
    }

    async function listePlagesHoraires(variables) {
        const query = `
            query listeCreneaux {
                listeCreneauxDispo {
                    creneaux
                }
            }
            `;
        return requeteGraphQL(query, variables)
            .then((resultats)=> {
                return JSON.parse(resultats.listeCreneauxDispo.creneaux)})
    }

    async function listeReservationsByDate(date) {
        const variables = {
            date: date
        };
        const query = `
        query reservation($date: String!) {
            listeReservationsByDate(date: $date) {
                reservationsByDate
            }
            }
        `;
        return requeteGraphQL(query, variables)
            .then((resultats)=> {
                return JSON.parse(resultats.listeReservationsByDate.reservationsByDate)
            })
    }

    /* src/svelte/reservationsMachines/reservationsMachines.svelte generated by Svelte v3.24.0 */

    const file$8 = "src/svelte/reservationsMachines/reservationsMachines.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[36] = list[i];
    	child_ctx[37] = list;
    	child_ctx[38] = i;
    	return child_ctx;
    }

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[33] = list[i];
    	child_ctx[35] = i;
    	return child_ctx;
    }

    // (270:137) {:else}
    function create_else_block_6(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(" ");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_6.name,
    		type: "else",
    		source: "(270:137) {:else}",
    		ctx
    	});

    	return block;
    }

    // (270:49) {#if donneesUtilisateur.cnc}
    function create_if_block_11(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: {
    				icon: faCheck,
    				size: "lg",
    				class: "mx-auto text-vertLBF"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_11.name,
    		type: "if",
    		source: "(270:49) {#if donneesUtilisateur.cnc}",
    		ctx
    	});

    	return block;
    }

    // (271:139) {:else}
    function create_else_block_5(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(" ");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_5.name,
    		type: "else",
    		source: "(271:139) {:else}",
    		ctx
    	});

    	return block;
    }

    // (271:49) {#if donneesUtilisateur.laser}
    function create_if_block_10(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: {
    				icon: faCheck,
    				size: "lg",
    				class: "mx-auto text-vertLBF"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_10.name,
    		type: "if",
    		source: "(271:49) {#if donneesUtilisateur.laser}",
    		ctx
    	});

    	return block;
    }

    // (272:145) {:else}
    function create_else_block_4(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(" ");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_4.name,
    		type: "else",
    		source: "(272:145) {:else}",
    		ctx
    	});

    	return block;
    }

    // (272:49) {#if donneesUtilisateur.scie_toupie}
    function create_if_block_9(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: {
    				icon: faCheck,
    				size: "lg",
    				class: "mx-auto text-vertLBF"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_9.name,
    		type: "if",
    		source: "(272:49) {#if donneesUtilisateur.scie_toupie}",
    		ctx
    	});

    	return block;
    }

    // (273:144) {:else}
    function create_else_block_3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(" ");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_3.name,
    		type: "else",
    		source: "(273:144) {:else}",
    		ctx
    	});

    	return block;
    }

    // (273:49) {#if donneesUtilisateur.rabo_degau}
    function create_if_block_8(ctx) {
    	let fa;
    	let current;

    	fa = new Fa({
    			props: {
    				icon: faCheck,
    				size: "lg",
    				class: "mx-auto text-vertLBF"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(fa.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fa, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fa, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_8.name,
    		type: "if",
    		source: "(273:49) {#if donneesUtilisateur.rabo_degau}",
    		ctx
    	});

    	return block;
    }

    // (282:20) {:else}
    function create_else_block_2$2(ctx) {
    	let td;
    	let t_value = /*donneesUtilisateur*/ ctx[1].abonnement + "";
    	let t;

    	const block = {
    		c: function create() {
    			td = element("td");
    			t = text(t_value);
    			attr_dev(td, "class", "border px-2 py-1 text-rougeLBF text-center");
    			attr_dev(td, "colspan", "2");
    			add_location(td, file$8, 282, 24, 12187);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*donneesUtilisateur*/ 2 && t_value !== (t_value = /*donneesUtilisateur*/ ctx[1].abonnement + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_2$2.name,
    		type: "else",
    		source: "(282:20) {:else}",
    		ctx
    	});

    	return block;
    }

    // (279:20) {#if donneesUtilisateur.estAbonne}
    function create_if_block_7(ctx) {
    	let td;
    	let t_value = /*donneesUtilisateur*/ ctx[1].abonnement + "";
    	let t;

    	const block = {
    		c: function create() {
    			td = element("td");
    			t = text(t_value);
    			attr_dev(td, "class", "border px-2 py-1 text-vertLBF text-center");
    			attr_dev(td, "colspan", "2");
    			add_location(td, file$8, 279, 24, 12031);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*donneesUtilisateur*/ 2 && t_value !== (t_value = /*donneesUtilisateur*/ ctx[1].abonnement + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_7.name,
    		type: "if",
    		source: "(279:20) {#if donneesUtilisateur.estAbonne}",
    		ctx
    	});

    	return block;
    }

    // (292:12) {#if donneesUtilisateur.cnc}
    function create_if_block_6(ctx) {
    	let radiobouton;
    	let updating_selected;
    	let current;

    	function radiobouton_selected_binding(value) {
    		/*radiobouton_selected_binding*/ ctx[13].call(null, value);
    	}

    	let radiobouton_props = {
    		label: "cnc",
    		cbClasses: tableCouleursLBF["jaune"].classText,
    		name: "machineReservation",
    		value: "cnc"
    	};

    	if (/*nouvelleReservation*/ ctx[2].machine !== void 0) {
    		radiobouton_props.selected = /*nouvelleReservation*/ ctx[2].machine;
    	}

    	radiobouton = new RadioButtons({ props: radiobouton_props, $$inline: true });
    	binding_callbacks.push(() => bind(radiobouton, "selected", radiobouton_selected_binding));

    	const block = {
    		c: function create() {
    			create_component(radiobouton.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(radiobouton, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const radiobouton_changes = {};

    			if (!updating_selected && dirty[0] & /*nouvelleReservation*/ 4) {
    				updating_selected = true;
    				radiobouton_changes.selected = /*nouvelleReservation*/ ctx[2].machine;
    				add_flush_callback(() => updating_selected = false);
    			}

    			radiobouton.$set(radiobouton_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(radiobouton.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(radiobouton.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(radiobouton, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6.name,
    		type: "if",
    		source: "(292:12) {#if donneesUtilisateur.cnc}",
    		ctx
    	});

    	return block;
    }

    // (295:12) {#if donneesUtilisateur.laser}
    function create_if_block_5(ctx) {
    	let radiobouton;
    	let updating_selected;
    	let current;

    	function radiobouton_selected_binding_1(value) {
    		/*radiobouton_selected_binding_1*/ ctx[14].call(null, value);
    	}

    	let radiobouton_props = {
    		label: "laser",
    		cbClasses: tableCouleursLBF["orange"].classText,
    		name: "machineReservation",
    		value: "laser"
    	};

    	if (/*nouvelleReservation*/ ctx[2].machine !== void 0) {
    		radiobouton_props.selected = /*nouvelleReservation*/ ctx[2].machine;
    	}

    	radiobouton = new RadioButtons({ props: radiobouton_props, $$inline: true });
    	binding_callbacks.push(() => bind(radiobouton, "selected", radiobouton_selected_binding_1));

    	const block = {
    		c: function create() {
    			create_component(radiobouton.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(radiobouton, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const radiobouton_changes = {};

    			if (!updating_selected && dirty[0] & /*nouvelleReservation*/ 4) {
    				updating_selected = true;
    				radiobouton_changes.selected = /*nouvelleReservation*/ ctx[2].machine;
    				add_flush_callback(() => updating_selected = false);
    			}

    			radiobouton.$set(radiobouton_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(radiobouton.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(radiobouton.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(radiobouton, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(295:12) {#if donneesUtilisateur.laser}",
    		ctx
    	});

    	return block;
    }

    // (298:12) {#if donneesUtilisateur.estAbonne }
    function create_if_block_2$2(ctx) {
    	let t;
    	let if_block1_anchor;
    	let current;
    	let if_block0 = /*donneesUtilisateur*/ ctx[1].scie_toupie && create_if_block_4(ctx);
    	let if_block1 = /*donneesUtilisateur*/ ctx[1].rabo_degau && create_if_block_3(ctx);

    	const block = {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*donneesUtilisateur*/ ctx[1].scie_toupie) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*donneesUtilisateur*/ 2) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_4(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*donneesUtilisateur*/ ctx[1].rabo_degau) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*donneesUtilisateur*/ 2) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(if_block1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(298:12) {#if donneesUtilisateur.estAbonne }",
    		ctx
    	});

    	return block;
    }

    // (299:16) {#if donneesUtilisateur.scie_toupie}
    function create_if_block_4(ctx) {
    	let radiobouton;
    	let updating_selected;
    	let current;

    	function radiobouton_selected_binding_2(value) {
    		/*radiobouton_selected_binding_2*/ ctx[15].call(null, value);
    	}

    	let radiobouton_props = {
    		label: "Scie-Toupie",
    		cbClasses: tableCouleursLBF["bleu"].classText,
    		name: "machineReservation",
    		value: "scie"
    	};

    	if (/*nouvelleReservation*/ ctx[2].machine !== void 0) {
    		radiobouton_props.selected = /*nouvelleReservation*/ ctx[2].machine;
    	}

    	radiobouton = new RadioButtons({ props: radiobouton_props, $$inline: true });
    	binding_callbacks.push(() => bind(radiobouton, "selected", radiobouton_selected_binding_2));

    	const block = {
    		c: function create() {
    			create_component(radiobouton.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(radiobouton, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const radiobouton_changes = {};

    			if (!updating_selected && dirty[0] & /*nouvelleReservation*/ 4) {
    				updating_selected = true;
    				radiobouton_changes.selected = /*nouvelleReservation*/ ctx[2].machine;
    				add_flush_callback(() => updating_selected = false);
    			}

    			radiobouton.$set(radiobouton_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(radiobouton.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(radiobouton.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(radiobouton, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(299:16) {#if donneesUtilisateur.scie_toupie}",
    		ctx
    	});

    	return block;
    }

    // (302:16) {#if donneesUtilisateur.rabo_degau}
    function create_if_block_3(ctx) {
    	let radiobouton;
    	let updating_selected;
    	let current;

    	function radiobouton_selected_binding_3(value) {
    		/*radiobouton_selected_binding_3*/ ctx[16].call(null, value);
    	}

    	let radiobouton_props = {
    		label: "Rabo-Degau",
    		cbClasses: tableCouleursLBF["vert"].classText,
    		name: "machineReservation",
    		value: "rabo"
    	};

    	if (/*nouvelleReservation*/ ctx[2].machine !== void 0) {
    		radiobouton_props.selected = /*nouvelleReservation*/ ctx[2].machine;
    	}

    	radiobouton = new RadioButtons({ props: radiobouton_props, $$inline: true });
    	binding_callbacks.push(() => bind(radiobouton, "selected", radiobouton_selected_binding_3));

    	const block = {
    		c: function create() {
    			create_component(radiobouton.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(radiobouton, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const radiobouton_changes = {};

    			if (!updating_selected && dirty[0] & /*nouvelleReservation*/ 4) {
    				updating_selected = true;
    				radiobouton_changes.selected = /*nouvelleReservation*/ ctx[2].machine;
    				add_flush_callback(() => updating_selected = false);
    			}

    			radiobouton.$set(radiobouton_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(radiobouton.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(radiobouton.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(radiobouton, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(302:16) {#if donneesUtilisateur.rabo_degau}",
    		ctx
    	});

    	return block;
    }

    // (312:8) {#if afficheCalendar}
    function create_if_block$4(ctx) {
    	let div8;
    	let div1;
    	let div0;
    	let datepicker;
    	let updating_selected;
    	let t0;
    	let div7;
    	let div2;
    	let t2;
    	let div3;
    	let t3;
    	let div4;
    	let t4;
    	let span0;
    	let t6;
    	let span1;
    	let t8;
    	let t9;
    	let div5;
    	let t10;
    	let div6;
    	let t11_value = /*choixHoraire*/ ctx[6].debut + "";
    	let t11;
    	let t12;
    	let t13_value = /*choixHoraire*/ ctx[6].fin + "";
    	let t13;
    	let current;

    	function datepicker_selected_binding(value) {
    		/*datepicker_selected_binding*/ ctx[18].call(null, value);
    	}

    	let datepicker_props = {
    		start: /*aujourdhui*/ ctx[7],
    		end: /*dateFinCalendrier*/ ctx[8],
    		daysOfWeek: dateFr.jours,
    		monthsOfYear: dateFr.mois,
    		format: dateFormat,
    		selectableCallback: /*creneauDispo*/ ctx[9]
    	};

    	if (/*dateChoisie*/ ctx[4] !== void 0) {
    		datepicker_props.selected = /*dateChoisie*/ ctx[4];
    	}

    	datepicker = new Datepicker({ props: datepicker_props, $$inline: true });
    	binding_callbacks.push(() => bind(datepicker, "selected", datepicker_selected_binding));
    	let each_value = /*creneauxDuJour*/ ctx[5];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	let each_1_else = null;

    	if (!each_value.length) {
    		each_1_else = create_else_block_1$2(ctx);
    	}

    	function select_block_type_5(ctx, dirty) {
    		if (!/*choixHoraire*/ ctx[6].choixOK) return create_if_block_1$3;
    		return create_else_block$3;
    	}

    	let current_block_type = select_block_type_5(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div8 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			create_component(datepicker.$$.fragment);
    			t0 = space();
    			div7 = element("div");
    			div2 = element("div");
    			div2.textContent = "Prochaines disponibilités";
    			t2 = space();
    			div3 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			if (each_1_else) {
    				each_1_else.c();
    			}

    			t3 = space();
    			div4 = element("div");
    			t4 = text("Cliquez sur l'heure de ");
    			span0 = element("span");
    			span0.textContent = "début";
    			t6 = text(" et de ");
    			span1 = element("span");
    			span1.textContent = "fin";
    			t8 = text(" de la réservation que vous souhaitez effectuer.");
    			t9 = space();
    			div5 = element("div");
    			if_block.c();
    			t10 = space();
    			div6 = element("div");
    			t11 = text(t11_value);
    			t12 = text(" & ");
    			t13 = text(t13_value);
    			attr_dev(div0, "class", "mx-auto text-center");
    			add_location(div0, file$8, 314, 20, 14065);
    			attr_dev(div1, "class", "flex-auto mb-4");
    			add_location(div1, file$8, 313, 16, 14016);
    			attr_dev(div2, "class", "h6 text-center lg:text-left mb-1");
    			add_location(div2, file$8, 327, 20, 14652);
    			attr_dev(div3, "class", "flex flex-row flex-wrap");
    			add_location(div3, file$8, 328, 20, 14750);
    			attr_dev(span0, "class", "text-vertLBF font-medium");
    			add_location(span0, file$8, 340, 47, 15495);
    			attr_dev(span1, "class", "text-bleuLBF font-medium");
    			add_location(span1, file$8, 340, 105, 15553);
    			attr_dev(div4, "class", "text-justify");
    			add_location(div4, file$8, 339, 20, 15421);
    			attr_dev(div5, "class", "text-rougeLBF font-medium");
    			add_location(div5, file$8, 342, 20, 15699);
    			attr_dev(div6, "class", "text-justify");
    			add_location(div6, file$8, 349, 20, 16014);
    			attr_dev(div7, "class", "flex-auto mb-4");
    			add_location(div7, file$8, 326, 16, 14603);
    			attr_dev(div8, "class", "flex flex-wrap items-center");
    			add_location(div8, file$8, 312, 12, 13958);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div8, anchor);
    			append_dev(div8, div1);
    			append_dev(div1, div0);
    			mount_component(datepicker, div0, null);
    			append_dev(div8, t0);
    			append_dev(div8, div7);
    			append_dev(div7, div2);
    			append_dev(div7, t2);
    			append_dev(div7, div3);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div3, null);
    			}

    			if (each_1_else) {
    				each_1_else.m(div3, null);
    			}

    			append_dev(div7, t3);
    			append_dev(div7, div4);
    			append_dev(div4, t4);
    			append_dev(div4, span0);
    			append_dev(div4, t6);
    			append_dev(div4, span1);
    			append_dev(div4, t8);
    			append_dev(div7, t9);
    			append_dev(div7, div5);
    			if_block.m(div5, null);
    			append_dev(div7, t10);
    			append_dev(div7, div6);
    			append_dev(div6, t11);
    			append_dev(div6, t12);
    			append_dev(div6, t13);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const datepicker_changes = {};

    			if (!updating_selected && dirty[0] & /*dateChoisie*/ 16) {
    				updating_selected = true;
    				datepicker_changes.selected = /*dateChoisie*/ ctx[4];
    				add_flush_callback(() => updating_selected = false);
    			}

    			datepicker.$set(datepicker_changes);

    			if (dirty[0] & /*creneauxDuJour*/ 32) {
    				each_value = /*creneauxDuJour*/ ctx[5];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div3, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();

    				if (each_value.length) {
    					if (each_1_else) {
    						each_1_else.d(1);
    						each_1_else = null;
    					}
    				} else if (!each_1_else) {
    					each_1_else = create_else_block_1$2(ctx);
    					each_1_else.c();
    					each_1_else.m(div3, null);
    				}
    			}

    			if (current_block_type !== (current_block_type = select_block_type_5(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div5, null);
    				}
    			}

    			if ((!current || dirty[0] & /*choixHoraire*/ 64) && t11_value !== (t11_value = /*choixHoraire*/ ctx[6].debut + "")) set_data_dev(t11, t11_value);
    			if ((!current || dirty[0] & /*choixHoraire*/ 64) && t13_value !== (t13_value = /*choixHoraire*/ ctx[6].fin + "")) set_data_dev(t13, t13_value);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(datepicker.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(datepicker.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div8);
    			destroy_component(datepicker);
    			destroy_each(each_blocks, detaching);
    			if (each_1_else) each_1_else.d();
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(312:8) {#if afficheCalendar}",
    		ctx
    	});

    	return block;
    }

    // (336:24) {:else}
    function create_else_block_1$2(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Aucun créneau à cette date";
    			add_location(div, file$8, 336, 28, 15297);
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
    		id: create_else_block_1$2.name,
    		type: "else",
    		source: "(336:24) {:else}",
    		ctx
    	});

    	return block;
    }

    // (331:28) {#each plage.creneaux as creneau, j}
    function create_each_block_1(ctx) {
    	let div;
    	let checkbox;
    	let updating_checked;
    	let updating_disabled;
    	let t;
    	let current;

    	function checkbox_checked_binding(value) {
    		/*checkbox_checked_binding*/ ctx[19].call(null, value, /*creneau*/ ctx[36]);
    	}

    	function checkbox_disabled_binding(value) {
    		/*checkbox_disabled_binding*/ ctx[20].call(null, value, /*creneau*/ ctx[36]);
    	}

    	let checkbox_props = {
    		label: /*creneau*/ ctx[36].label,
    		cbClasses: /*creneau*/ ctx[36].class
    	};

    	if (/*creneau*/ ctx[36].checked !== void 0) {
    		checkbox_props.checked = /*creneau*/ ctx[36].checked;
    	}

    	if (/*creneau*/ ctx[36].disabled !== void 0) {
    		checkbox_props.disabled = /*creneau*/ ctx[36].disabled;
    	}

    	checkbox = new Checkbox({ props: checkbox_props, $$inline: true });
    	binding_callbacks.push(() => bind(checkbox, "checked", checkbox_checked_binding));
    	binding_callbacks.push(() => bind(checkbox, "disabled", checkbox_disabled_binding));

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(checkbox.$$.fragment);
    			t = space();
    			attr_dev(div, "class", "px-2 py-1 mr-2 mb-2 border border-gray-400");
    			add_location(div, file$8, 331, 32, 14944);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(checkbox, div, null);
    			append_dev(div, t);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const checkbox_changes = {};
    			if (dirty[0] & /*creneauxDuJour*/ 32) checkbox_changes.label = /*creneau*/ ctx[36].label;
    			if (dirty[0] & /*creneauxDuJour*/ 32) checkbox_changes.cbClasses = /*creneau*/ ctx[36].class;

    			if (!updating_checked && dirty[0] & /*creneauxDuJour*/ 32) {
    				updating_checked = true;
    				checkbox_changes.checked = /*creneau*/ ctx[36].checked;
    				add_flush_callback(() => updating_checked = false);
    			}

    			if (!updating_disabled && dirty[0] & /*creneauxDuJour*/ 32) {
    				updating_disabled = true;
    				checkbox_changes.disabled = /*creneau*/ ctx[36].disabled;
    				add_flush_callback(() => updating_disabled = false);
    			}

    			checkbox.$set(checkbox_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(checkbox.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(checkbox.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(checkbox);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(331:28) {#each plage.creneaux as creneau, j}",
    		ctx
    	});

    	return block;
    }

    // (330:24) {#each creneauxDuJour as plage, i}
    function create_each_block$4(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value_1 = /*plage*/ ctx[33].creneaux;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*creneauxDuJour*/ 32) {
    				each_value_1 = /*plage*/ ctx[33].creneaux;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value_1.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$4.name,
    		type: "each",
    		source: "(330:24) {#each creneauxDuJour as plage, i}",
    		ctx
    	});

    	return block;
    }

    // (346:24) {:else}
    function create_else_block$3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(" ");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$3.name,
    		type: "else",
    		source: "(346:24) {:else}",
    		ctx
    	});

    	return block;
    }

    // (344:24) {#if !choixHoraire.choixOK}
    function create_if_block_1$3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Une heure minimum requis pour les machines à bois.");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(344:24) {#if !choixHoraire.choixOK}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let div17;
    	let div4;
    	let label0;
    	let div0;
    	let t1;
    	let div1;
    	let input0;
    	let t2;
    	let label1;
    	let div2;
    	let t4;
    	let div3;
    	let input1;
    	let t5;
    	let div7;
    	let label2;
    	let div5;
    	let t7;
    	let div6;
    	let input2;
    	let t8;
    	let div14;
    	let div8;
    	let t10;
    	let div9;
    	let t12;
    	let div10;
    	let table;
    	let thead;
    	let tr0;
    	let th0;
    	let t14;
    	let th1;
    	let t16;
    	let th2;
    	let t18;
    	let th3;
    	let t20;
    	let th4;
    	let t22;
    	let tbody;
    	let tr1;
    	let td0;
    	let t24;
    	let td1;
    	let current_block_type_index;
    	let if_block0;
    	let t25;
    	let td2;
    	let current_block_type_index_1;
    	let if_block1;
    	let t26;
    	let td3;
    	let current_block_type_index_2;
    	let if_block2;
    	let t27;
    	let td4;
    	let current_block_type_index_3;
    	let if_block3;
    	let t28;
    	let tr2;
    	let td5;
    	let t30;
    	let td6;
    	let t32;
    	let td7;
    	let t34;
    	let t35;
    	let div11;
    	let t37;
    	let div12;
    	let t38;
    	let t39;
    	let t40;
    	let radiobouton;
    	let updating_selected;
    	let t41;
    	let div13;
    	let t42;
    	let t43_value = /*nouvelleReservation*/ ctx[2].machine + "";
    	let t43;
    	let t44;
    	let div16;
    	let div15;
    	let t46;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block_11, create_else_block_6];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*donneesUtilisateur*/ ctx[1].cnc) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const if_block_creators_1 = [create_if_block_10, create_else_block_5];
    	const if_blocks_1 = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*donneesUtilisateur*/ ctx[1].laser) return 0;
    		return 1;
    	}

    	current_block_type_index_1 = select_block_type_1(ctx);
    	if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
    	const if_block_creators_2 = [create_if_block_9, create_else_block_4];
    	const if_blocks_2 = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*donneesUtilisateur*/ ctx[1].scie_toupie) return 0;
    		return 1;
    	}

    	current_block_type_index_2 = select_block_type_2(ctx);
    	if_block2 = if_blocks_2[current_block_type_index_2] = if_block_creators_2[current_block_type_index_2](ctx);
    	const if_block_creators_3 = [create_if_block_8, create_else_block_3];
    	const if_blocks_3 = [];

    	function select_block_type_3(ctx, dirty) {
    		if (/*donneesUtilisateur*/ ctx[1].rabo_degau) return 0;
    		return 1;
    	}

    	current_block_type_index_3 = select_block_type_3(ctx);
    	if_block3 = if_blocks_3[current_block_type_index_3] = if_block_creators_3[current_block_type_index_3](ctx);

    	function select_block_type_4(ctx, dirty) {
    		if (/*donneesUtilisateur*/ ctx[1].estAbonne) return create_if_block_7;
    		return create_else_block_2$2;
    	}

    	let current_block_type = select_block_type_4(ctx);
    	let if_block4 = current_block_type(ctx);
    	let if_block5 = /*donneesUtilisateur*/ ctx[1].cnc && create_if_block_6(ctx);
    	let if_block6 = /*donneesUtilisateur*/ ctx[1].laser && create_if_block_5(ctx);
    	let if_block7 = /*donneesUtilisateur*/ ctx[1].estAbonne && create_if_block_2$2(ctx);

    	function radiobouton_selected_binding_4(value) {
    		/*radiobouton_selected_binding_4*/ ctx[17].call(null, value);
    	}

    	let radiobouton_props = {
    		label: "Imprimante 3D",
    		cbClasses: tableCouleursLBF["rouge"].classText,
    		name: "machineReservation",
    		value: "3D"
    	};

    	if (/*nouvelleReservation*/ ctx[2].machine !== void 0) {
    		radiobouton_props.selected = /*nouvelleReservation*/ ctx[2].machine;
    	}

    	radiobouton = new RadioButtons({ props: radiobouton_props, $$inline: true });
    	binding_callbacks.push(() => bind(radiobouton, "selected", radiobouton_selected_binding_4));
    	let if_block8 = /*afficheCalendar*/ ctx[3] && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			div17 = element("div");
    			div4 = element("div");
    			label0 = element("label");
    			div0 = element("div");
    			div0.textContent = "Prénom :";
    			t1 = space();
    			div1 = element("div");
    			input0 = element("input");
    			t2 = space();
    			label1 = element("label");
    			div2 = element("div");
    			div2.textContent = "Nom :";
    			t4 = space();
    			div3 = element("div");
    			input1 = element("input");
    			t5 = space();
    			div7 = element("div");
    			label2 = element("label");
    			div5 = element("div");
    			div5.textContent = "Email (requis) :";
    			t7 = space();
    			div6 = element("div");
    			input2 = element("input");
    			t8 = space();
    			div14 = element("div");
    			div8 = element("div");
    			div8.textContent = "Machine :";
    			t10 = space();
    			div9 = element("div");
    			div9.textContent = "Votre statut :";
    			t12 = space();
    			div10 = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr0 = element("tr");
    			th0 = element("th");
    			th0.textContent = " ";
    			t14 = space();
    			th1 = element("th");
    			th1.textContent = "CNC";
    			t16 = space();
    			th2 = element("th");
    			th2.textContent = "Laser";
    			t18 = space();
    			th3 = element("th");
    			th3.textContent = "Scie/Toupie";
    			t20 = space();
    			th4 = element("th");
    			th4.textContent = "Rabot/dégau";
    			t22 = space();
    			tbody = element("tbody");
    			tr1 = element("tr");
    			td0 = element("td");
    			td0.textContent = "Initiation";
    			t24 = space();
    			td1 = element("td");
    			if_block0.c();
    			t25 = space();
    			td2 = element("td");
    			if_block1.c();
    			t26 = space();
    			td3 = element("td");
    			if_block2.c();
    			t27 = space();
    			td4 = element("td");
    			if_block3.c();
    			t28 = space();
    			tr2 = element("tr");
    			td5 = element("td");
    			td5.textContent = "Abonnement valide";
    			t30 = space();
    			td6 = element("td");
    			td6.textContent = " ";
    			t32 = space();
    			td7 = element("td");
    			td7.textContent = " ";
    			t34 = space();
    			if_block4.c();
    			t35 = space();
    			div11 = element("div");
    			div11.textContent = "Vous pouvez réserver les machines suivantes :";
    			t37 = space();
    			div12 = element("div");
    			if (if_block5) if_block5.c();
    			t38 = space();
    			if (if_block6) if_block6.c();
    			t39 = space();
    			if (if_block7) if_block7.c();
    			t40 = space();
    			create_component(radiobouton.$$.fragment);
    			t41 = space();
    			div13 = element("div");
    			t42 = text("machine : ");
    			t43 = text(t43_value);
    			t44 = space();
    			div16 = element("div");
    			div15 = element("div");
    			div15.textContent = "Date :";
    			t46 = space();
    			if (if_block8) if_block8.c();
    			add_location(div0, file$8, 217, 12, 8717);
    			attr_dev(input0, "class", "w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "id", "prenomResa");
    			add_location(input0, file$8, 219, 16, 8813);
    			attr_dev(div1, "class", "border border-vertLBF rounded p-1");
    			add_location(div1, file$8, 218, 12, 8749);
    			attr_dev(label0, "for", "prenomResa");
    			attr_dev(label0, "class", "w-1/2 px-1 py-1 flex flex-col");
    			add_location(label0, file$8, 216, 8, 8642);
    			add_location(div2, file$8, 228, 12, 9208);
    			attr_dev(input1, "class", "w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "id", "nomResa");
    			add_location(input1, file$8, 230, 16, 9301);
    			attr_dev(div3, "class", "border border-vertLBF rounded p-1");
    			add_location(div3, file$8, 229, 12, 9237);
    			attr_dev(label1, "for", "nomResa");
    			attr_dev(label1, "class", "w-1/2 px-1 py-1 flex flex-col");
    			add_location(label1, file$8, 227, 8, 9136);
    			attr_dev(div4, "class", "w-full flex flex-row flex-wrap justify-between");
    			add_location(div4, file$8, 215, 4, 8573);
    			add_location(div5, file$8, 241, 12, 9707);
    			attr_dev(input2, "class", "w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal");
    			attr_dev(input2, "type", "text");
    			attr_dev(input2, "id", "emailResa");
    			add_location(input2, file$8, 243, 16, 9811);
    			attr_dev(div6, "class", "border border-vertLBF rounded p-1");
    			add_location(div6, file$8, 242, 12, 9747);
    			attr_dev(label2, "for", "emailResa");
    			attr_dev(label2, "class", "mx-1 my-1 flex flex-col");
    			add_location(label2, file$8, 240, 8, 9639);
    			add_location(div7, file$8, 239, 4, 9625);
    			attr_dev(div8, "class", "h5 mt-4 mb-1");
    			add_location(div8, file$8, 253, 4, 10149);
    			add_location(div9, file$8, 254, 8, 10199);
    			attr_dev(th0, "class", "px-2 py-1 border border-gray-400 text-gray-800");
    			add_location(th0, file$8, 259, 20, 10420);
    			attr_dev(th1, "class", "px-2 py-1 border border-gray-400 text-gray-800");
    			add_location(th1, file$8, 260, 20, 10511);
    			attr_dev(th2, "class", "px-2 py-1 border border-gray-400 text-gray-800");
    			add_location(th2, file$8, 261, 20, 10599);
    			attr_dev(th3, "class", "px-2 py-1 border border-gray-400 text-gray-800");
    			add_location(th3, file$8, 262, 20, 10689);
    			attr_dev(th4, "class", "px-2 py-1 border border-gray-400 text-gray-800");
    			add_location(th4, file$8, 263, 20, 10785);
    			add_location(tr0, file$8, 258, 20, 10395);
    			add_location(thead, file$8, 257, 16, 10367);
    			attr_dev(td0, "class", "border px-2 py-1");
    			add_location(td0, file$8, 268, 20, 10981);
    			attr_dev(td1, "class", "border px-2 py-1");
    			add_location(td1, file$8, 269, 20, 11046);
    			attr_dev(td2, "class", "border px-2 py-1");
    			add_location(td2, file$8, 270, 20, 11207);
    			attr_dev(td3, "class", "border px-2 py-1");
    			add_location(td3, file$8, 271, 20, 11370);
    			attr_dev(td4, "class", "border px-2 py-1");
    			add_location(td4, file$8, 272, 20, 11539);
    			add_location(tr1, file$8, 267, 20, 10956);
    			attr_dev(td5, "class", "border px-2 py-1");
    			add_location(td5, file$8, 275, 20, 11778);
    			attr_dev(td6, "class", "border px-2 py-1");
    			add_location(td6, file$8, 276, 20, 11850);
    			attr_dev(td7, "class", "border px-2 py-1");
    			add_location(td7, file$8, 277, 20, 11911);
    			attr_dev(tr2, "class", "bg-gray-100");
    			add_location(tr2, file$8, 274, 20, 11733);
    			add_location(tbody, file$8, 266, 16, 10928);
    			attr_dev(table, "class", "table-auto border-collapse border-2 border-gray-500 mx-auto");
    			add_location(table, file$8, 256, 12, 10275);
    			attr_dev(div10, "class", "overflow-x-auto");
    			add_location(div10, file$8, 255, 8, 10233);
    			attr_dev(div11, "class", "text-base mt-2");
    			add_location(div11, file$8, 289, 8, 12421);
    			attr_dev(div12, "class", "flex");
    			add_location(div12, file$8, 290, 8, 12509);
    			add_location(div13, file$8, 307, 8, 13797);
    			add_location(div14, file$8, 252, 4, 10139);
    			attr_dev(div15, "class", "h5 mt-4 mb-1");
    			add_location(div15, file$8, 310, 8, 13877);
    			add_location(div16, file$8, 309, 4, 13863);
    			attr_dev(div17, "class", "mt-2 mb-2");
    			add_location(div17, file$8, 214, 0, 8545);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div17, anchor);
    			append_dev(div17, div4);
    			append_dev(div4, label0);
    			append_dev(label0, div0);
    			append_dev(label0, t1);
    			append_dev(label0, div1);
    			append_dev(div1, input0);
    			set_input_value(input0, /*userInfo*/ ctx[0].prenom);
    			append_dev(div4, t2);
    			append_dev(div4, label1);
    			append_dev(label1, div2);
    			append_dev(label1, t4);
    			append_dev(label1, div3);
    			append_dev(div3, input1);
    			set_input_value(input1, /*userInfo*/ ctx[0].nom);
    			append_dev(div17, t5);
    			append_dev(div17, div7);
    			append_dev(div7, label2);
    			append_dev(label2, div5);
    			append_dev(label2, t7);
    			append_dev(label2, div6);
    			append_dev(div6, input2);
    			set_input_value(input2, /*userInfo*/ ctx[0].email);
    			append_dev(div17, t8);
    			append_dev(div17, div14);
    			append_dev(div14, div8);
    			append_dev(div14, t10);
    			append_dev(div14, div9);
    			append_dev(div14, t12);
    			append_dev(div14, div10);
    			append_dev(div10, table);
    			append_dev(table, thead);
    			append_dev(thead, tr0);
    			append_dev(tr0, th0);
    			append_dev(tr0, t14);
    			append_dev(tr0, th1);
    			append_dev(tr0, t16);
    			append_dev(tr0, th2);
    			append_dev(tr0, t18);
    			append_dev(tr0, th3);
    			append_dev(tr0, t20);
    			append_dev(tr0, th4);
    			append_dev(table, t22);
    			append_dev(table, tbody);
    			append_dev(tbody, tr1);
    			append_dev(tr1, td0);
    			append_dev(tr1, t24);
    			append_dev(tr1, td1);
    			if_blocks[current_block_type_index].m(td1, null);
    			append_dev(tr1, t25);
    			append_dev(tr1, td2);
    			if_blocks_1[current_block_type_index_1].m(td2, null);
    			append_dev(tr1, t26);
    			append_dev(tr1, td3);
    			if_blocks_2[current_block_type_index_2].m(td3, null);
    			append_dev(tr1, t27);
    			append_dev(tr1, td4);
    			if_blocks_3[current_block_type_index_3].m(td4, null);
    			append_dev(tbody, t28);
    			append_dev(tbody, tr2);
    			append_dev(tr2, td5);
    			append_dev(tr2, t30);
    			append_dev(tr2, td6);
    			append_dev(tr2, t32);
    			append_dev(tr2, td7);
    			append_dev(tr2, t34);
    			if_block4.m(tr2, null);
    			append_dev(div14, t35);
    			append_dev(div14, div11);
    			append_dev(div14, t37);
    			append_dev(div14, div12);
    			if (if_block5) if_block5.m(div12, null);
    			append_dev(div12, t38);
    			if (if_block6) if_block6.m(div12, null);
    			append_dev(div12, t39);
    			if (if_block7) if_block7.m(div12, null);
    			append_dev(div12, t40);
    			mount_component(radiobouton, div12, null);
    			append_dev(div14, t41);
    			append_dev(div14, div13);
    			append_dev(div13, t42);
    			append_dev(div13, t43);
    			append_dev(div17, t44);
    			append_dev(div17, div16);
    			append_dev(div16, div15);
    			append_dev(div16, t46);
    			if (if_block8) if_block8.m(div16, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[10]),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[11]),
    					listen_dev(input2, "input", /*input2_input_handler*/ ctx[12])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*userInfo*/ 1 && input0.value !== /*userInfo*/ ctx[0].prenom) {
    				set_input_value(input0, /*userInfo*/ ctx[0].prenom);
    			}

    			if (dirty[0] & /*userInfo*/ 1 && input1.value !== /*userInfo*/ ctx[0].nom) {
    				set_input_value(input1, /*userInfo*/ ctx[0].nom);
    			}

    			if (dirty[0] & /*userInfo*/ 1 && input2.value !== /*userInfo*/ ctx[0].email) {
    				set_input_value(input2, /*userInfo*/ ctx[0].email);
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(td1, null);
    			}

    			let previous_block_index_1 = current_block_type_index_1;
    			current_block_type_index_1 = select_block_type_1(ctx);

    			if (current_block_type_index_1 === previous_block_index_1) {
    				if_blocks_1[current_block_type_index_1].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks_1[previous_block_index_1], 1, 1, () => {
    					if_blocks_1[previous_block_index_1] = null;
    				});

    				check_outros();
    				if_block1 = if_blocks_1[current_block_type_index_1];

    				if (!if_block1) {
    					if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
    					if_block1.c();
    				}

    				transition_in(if_block1, 1);
    				if_block1.m(td2, null);
    			}

    			let previous_block_index_2 = current_block_type_index_2;
    			current_block_type_index_2 = select_block_type_2(ctx);

    			if (current_block_type_index_2 === previous_block_index_2) {
    				if_blocks_2[current_block_type_index_2].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks_2[previous_block_index_2], 1, 1, () => {
    					if_blocks_2[previous_block_index_2] = null;
    				});

    				check_outros();
    				if_block2 = if_blocks_2[current_block_type_index_2];

    				if (!if_block2) {
    					if_block2 = if_blocks_2[current_block_type_index_2] = if_block_creators_2[current_block_type_index_2](ctx);
    					if_block2.c();
    				}

    				transition_in(if_block2, 1);
    				if_block2.m(td3, null);
    			}

    			let previous_block_index_3 = current_block_type_index_3;
    			current_block_type_index_3 = select_block_type_3(ctx);

    			if (current_block_type_index_3 === previous_block_index_3) {
    				if_blocks_3[current_block_type_index_3].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks_3[previous_block_index_3], 1, 1, () => {
    					if_blocks_3[previous_block_index_3] = null;
    				});

    				check_outros();
    				if_block3 = if_blocks_3[current_block_type_index_3];

    				if (!if_block3) {
    					if_block3 = if_blocks_3[current_block_type_index_3] = if_block_creators_3[current_block_type_index_3](ctx);
    					if_block3.c();
    				}

    				transition_in(if_block3, 1);
    				if_block3.m(td4, null);
    			}

    			if (current_block_type === (current_block_type = select_block_type_4(ctx)) && if_block4) {
    				if_block4.p(ctx, dirty);
    			} else {
    				if_block4.d(1);
    				if_block4 = current_block_type(ctx);

    				if (if_block4) {
    					if_block4.c();
    					if_block4.m(tr2, null);
    				}
    			}

    			if (/*donneesUtilisateur*/ ctx[1].cnc) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*donneesUtilisateur*/ 2) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_6(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(div12, t38);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*donneesUtilisateur*/ ctx[1].laser) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[0] & /*donneesUtilisateur*/ 2) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_5(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(div12, t39);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}

    			if (/*donneesUtilisateur*/ ctx[1].estAbonne) {
    				if (if_block7) {
    					if_block7.p(ctx, dirty);

    					if (dirty[0] & /*donneesUtilisateur*/ 2) {
    						transition_in(if_block7, 1);
    					}
    				} else {
    					if_block7 = create_if_block_2$2(ctx);
    					if_block7.c();
    					transition_in(if_block7, 1);
    					if_block7.m(div12, t40);
    				}
    			} else if (if_block7) {
    				group_outros();

    				transition_out(if_block7, 1, 1, () => {
    					if_block7 = null;
    				});

    				check_outros();
    			}

    			const radiobouton_changes = {};

    			if (!updating_selected && dirty[0] & /*nouvelleReservation*/ 4) {
    				updating_selected = true;
    				radiobouton_changes.selected = /*nouvelleReservation*/ ctx[2].machine;
    				add_flush_callback(() => updating_selected = false);
    			}

    			radiobouton.$set(radiobouton_changes);
    			if ((!current || dirty[0] & /*nouvelleReservation*/ 4) && t43_value !== (t43_value = /*nouvelleReservation*/ ctx[2].machine + "")) set_data_dev(t43, t43_value);

    			if (/*afficheCalendar*/ ctx[3]) {
    				if (if_block8) {
    					if_block8.p(ctx, dirty);

    					if (dirty[0] & /*afficheCalendar*/ 8) {
    						transition_in(if_block8, 1);
    					}
    				} else {
    					if_block8 = create_if_block$4(ctx);
    					if_block8.c();
    					transition_in(if_block8, 1);
    					if_block8.m(div16, null);
    				}
    			} else if (if_block8) {
    				group_outros();

    				transition_out(if_block8, 1, 1, () => {
    					if_block8 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			transition_in(if_block7);
    			transition_in(radiobouton.$$.fragment, local);
    			transition_in(if_block8);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			transition_out(if_block7);
    			transition_out(radiobouton.$$.fragment, local);
    			transition_out(if_block8);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div17);
    			if_blocks[current_block_type_index].d();
    			if_blocks_1[current_block_type_index_1].d();
    			if_blocks_2[current_block_type_index_2].d();
    			if_blocks_3[current_block_type_index_3].d();
    			if_block4.d();
    			if (if_block5) if_block5.d();
    			if (if_block6) if_block6.d();
    			if (if_block7) if_block7.d();
    			destroy_component(radiobouton);
    			if (if_block8) if_block8.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const dateFormat = "#{l} #{j} #{F} #{Y}";

    function instance$8($$self, $$props, $$invalidate) {
    	var userInfo = { nom: "", prenom: "", email: "" };
    	var mailValide = false;
    	var donneesUtilisateur = {};
    	var estAbonne = false;
    	var nouvelleReservation = { machine: "", creneaux: [] };
    	var plagesReservations = [];
    	var afficheCalendar = false;
    	const aujourdhui = new Date();
    	var dateFinCalendrier = new Date();
    	var dateChoisie = new Date();
    	var dateChoisiePourRequete = dateChoisie;
    	var listeReservations = [];
    	var listeReservationsFiltreMachine = [];
    	var creneauxDuJour = [];

    	var choixHoraire = {
    		debut: "",
    		fin: "",
    		choixOK: false,
    		duree: 0
    	};

    	var intervalCreneau = 1;
    	const tzoffset = new Date().getTimezoneOffset() * 60000; //offset in milliseconds
    	dateFinCalendrier.setMonth(dateFinCalendrier.getMonth() + 24);

    	onMount(() => {
    		/* if (localStorage["userInfo"]) {
        userInfo = JSON.parse(localStorage.getItem("userInfo"));
        saveInfo = true;
    } */
    		listePlagesHoraires().then(retour => {
    			plagesReservations[0] = retour.dimanche;
    			plagesReservations[1] = retour.lundi;
    			plagesReservations[2] = retour.mardi;
    			plagesReservations[3] = retour.mercredi;
    			plagesReservations[4] = retour.jeudi;
    			plagesReservations[5] = retour.vendredi;
    			plagesReservations[6] = retour.samedi;
    			$$invalidate(3, afficheCalendar = true);
    		});
    	});

    	function constructionCreneaux(date) {
    		let zeDate = new Date(date);

    		if (plagesReservations[zeDate.getDay()]) {
    			plagesReservations[zeDate.getDay()].forEach((plage, index) => {
    				let horaireDebutSplit = plage.debut.split(":");
    				let horaireFinSplit = plage.fin.split(":");
    				let lesCreneaux = horaireFinSplit[0] - horaireDebutSplit[0] + (Number(horaireFinSplit[1]) - Number(horaireDebutSplit[1])) / 60;
    				$$invalidate(5, creneauxDuJour[index] = { "creneaux": [] }, creneauxDuJour);
    				let estReserve = false;

    				for (let j = 0; j <= lesCreneaux; j += 0.5) {
    					let h = [];
    					let label = "";

    					if (j === 0) {
    						estReserve = verifReserve(plage.debut);
    						h = plage.debut.split(":");

    						if (h[1] === "30") {
    							h[0] = Number(h[0]) + 1;
    							h[1] = "00";
    						} else {
    							h[1] = "30";
    						}

    						label = horaireFr(plage.debut) + "-" + horaireFr(h.join(":"));

    						creneauxDuJour[index].creneaux.push({
    							"debut": plage.debut,
    							"fin": h.join(":"),
    							label,
    							"checked": false,
    							"disabled": estReserve,
    							estReserve,
    							"class": "text-gray-800"
    						});
    					} else {
    						h = creneauxDuJour[index].creneaux[2 * j - 1].fin.split(":");

    						if (h[1] === "30") {
    							h[0] = Number(h[0]) + 1;
    							h[1] = "00";
    						} else {
    							h[1] = "30";
    						}

    						label = horaireFr(creneauxDuJour[index].creneaux[2 * j - 1].fin) + "-" + horaireFr(h.join(":"));
    						estReserve = verifReserve(h.join(":"));

    						creneauxDuJour[index].creneaux.push({
    							"debut": creneauxDuJour[index].creneaux[2 * j - 1].fin,
    							"fin": h.join(":"),
    							label,
    							"checked": false,
    							"disabled": estReserve,
    							estReserve,
    							"class": "text-gray-800"
    						});
    					}
    				}
    			});
    		}
    	}

    	function creneauDispo(date) {
    		return plagesReservations[getJourSemaine(date)].length > 0;
    	}

    	function verifChoix() {
    		let heureDebut = choixHoraire.debut.split(":");
    		let heureFin = choixHoraire.fin.split(":");
    		$$invalidate(6, choixHoraire.duree = 60 * (Number(heureFin[0]) - Number(heureDebut[0])) + Number(heureFin[1]) - Number(heureDebut[1]), choixHoraire);

    		if (choixHoraire.duree > intervalCreneau * 30) {
    			$$invalidate(6, choixHoraire.choixOK = true, choixHoraire);
    		} else {
    			$$invalidate(6, choixHoraire.choixOK = false, choixHoraire);
    		}
    	}

    	function verifReserve(heure) {
    		let heureSplit = heure.split(":");
    		let retour = false;

    		listeReservationsFiltreMachine.forEach(resa => {
    			let heureDebutSplit = resa.heureDebut.split(":");
    			let heureFinSplit = resa.heureFin.split(":");
    			let dureeReservation = 60 * (Number(heureFinSplit[0]) - Number(heureDebutSplit[0])) + Number(heureFinSplit[1]) - Number(heureDebutSplit[1]);
    			let dureeToCheck = 60 * (Number(heureSplit[0]) - Number(heureDebutSplit[0])) + Number(heureSplit[1]) - Number(heureDebutSplit[1]);

    			if (dureeToCheck >= 0 && dureeToCheck < dureeReservation) {
    				retour = true;
    			}
    		});

    		return retour;
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ReservationsMachines> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("ReservationsMachines", $$slots, []);

    	function input0_input_handler() {
    		userInfo.prenom = this.value;
    		$$invalidate(0, userInfo);
    	}

    	function input1_input_handler() {
    		userInfo.nom = this.value;
    		$$invalidate(0, userInfo);
    	}

    	function input2_input_handler() {
    		userInfo.email = this.value;
    		$$invalidate(0, userInfo);
    	}

    	function radiobouton_selected_binding(value) {
    		nouvelleReservation.machine = value;
    		$$invalidate(2, nouvelleReservation);
    	}

    	function radiobouton_selected_binding_1(value) {
    		nouvelleReservation.machine = value;
    		$$invalidate(2, nouvelleReservation);
    	}

    	function radiobouton_selected_binding_2(value) {
    		nouvelleReservation.machine = value;
    		$$invalidate(2, nouvelleReservation);
    	}

    	function radiobouton_selected_binding_3(value) {
    		nouvelleReservation.machine = value;
    		$$invalidate(2, nouvelleReservation);
    	}

    	function radiobouton_selected_binding_4(value) {
    		nouvelleReservation.machine = value;
    		$$invalidate(2, nouvelleReservation);
    	}

    	function datepicker_selected_binding(value) {
    		dateChoisie = value;
    		$$invalidate(4, dateChoisie);
    	}

    	function checkbox_checked_binding(value, creneau) {
    		creneau.checked = value;
    		$$invalidate(5, creneauxDuJour);
    	}

    	function checkbox_disabled_binding(value, creneau) {
    		creneau.disabled = value;
    		$$invalidate(5, creneauxDuJour);
    	}

    	$$self.$capture_state = () => ({
    		onMount,
    		Datepicker,
    		getJourSemaine,
    		horaireFr,
    		dateFr,
    		RadioBouton: RadioButtons,
    		Checkbox,
    		Fa,
    		faCheck,
    		faTimes,
    		tableCouleursLBF,
    		userData,
    		listePlagesHoraires,
    		listeReservationsByDate,
    		userInfo,
    		mailValide,
    		donneesUtilisateur,
    		estAbonne,
    		nouvelleReservation,
    		plagesReservations,
    		afficheCalendar,
    		dateFormat,
    		aujourdhui,
    		dateFinCalendrier,
    		dateChoisie,
    		dateChoisiePourRequete,
    		listeReservations,
    		listeReservationsFiltreMachine,
    		creneauxDuJour,
    		choixHoraire,
    		intervalCreneau,
    		tzoffset,
    		extracted,
    		constructionCreneaux,
    		creneauDispo,
    		verifChoix,
    		verifReserve
    	});

    	$$self.$inject_state = $$props => {
    		if ("userInfo" in $$props) $$invalidate(0, userInfo = $$props.userInfo);
    		if ("mailValide" in $$props) mailValide = $$props.mailValide;
    		if ("donneesUtilisateur" in $$props) $$invalidate(1, donneesUtilisateur = $$props.donneesUtilisateur);
    		if ("estAbonne" in $$props) estAbonne = $$props.estAbonne;
    		if ("nouvelleReservation" in $$props) $$invalidate(2, nouvelleReservation = $$props.nouvelleReservation);
    		if ("plagesReservations" in $$props) plagesReservations = $$props.plagesReservations;
    		if ("afficheCalendar" in $$props) $$invalidate(3, afficheCalendar = $$props.afficheCalendar);
    		if ("dateFinCalendrier" in $$props) $$invalidate(8, dateFinCalendrier = $$props.dateFinCalendrier);
    		if ("dateChoisie" in $$props) $$invalidate(4, dateChoisie = $$props.dateChoisie);
    		if ("dateChoisiePourRequete" in $$props) $$invalidate(23, dateChoisiePourRequete = $$props.dateChoisiePourRequete);
    		if ("listeReservations" in $$props) $$invalidate(24, listeReservations = $$props.listeReservations);
    		if ("listeReservationsFiltreMachine" in $$props) listeReservationsFiltreMachine = $$props.listeReservationsFiltreMachine;
    		if ("creneauxDuJour" in $$props) $$invalidate(5, creneauxDuJour = $$props.creneauxDuJour);
    		if ("choixHoraire" in $$props) $$invalidate(6, choixHoraire = $$props.choixHoraire);
    		if ("intervalCreneau" in $$props) intervalCreneau = $$props.intervalCreneau;
    		if ("extracted" in $$props) $$invalidate(29, extracted = $$props.extracted);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*userInfo*/ 1) {
    			 {
    				var extracted = (/([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i).exec(userInfo.email);
    				mailValide = extracted !== null;

    				if (extracted !== null) {
    					userData(userInfo.email).then(retour => {
    						$$invalidate(1, donneesUtilisateur = retour);
    					});
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*dateChoisie, dateChoisiePourRequete*/ 8388624) {
    			 {
    				let zeDate = new Date(dateChoisie - tzoffset);
    				$$invalidate(23, dateChoisiePourRequete = zeDate.toISOString().slice(0, 10));

    				listeReservationsByDate(dateChoisiePourRequete).then(retour => {
    					$$invalidate(24, listeReservations = retour);
    				});

    				constructionCreneaux(zeDate);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*listeReservations, nouvelleReservation, dateChoisie*/ 16777236) {
    			/*
    recupération des créneaux déjà réservé
    */
    			 {
    				listeReservationsFiltreMachine = listeReservations.filter(resa => {
    					return resa.machine.tag === nouvelleReservation.machine;
    				});

    				let zeDate = new Date(dateChoisie - tzoffset);
    				constructionCreneaux(zeDate);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*creneauxDuJour*/ 32) {
    			/*
    Gestion de la sélection des créneaux horaires
    */
    			 {
    				creneauxDuJour.forEach(lesCreneaux => {
    					let listeChecked = [];
    					let indexMinReserve = 0; // max de l'index du créneau réservé inférieur au premier choix
    					let indexMaxReserve = 1000; // min de l'index du créneau réservé supérieur au premier choix
    					let flagDisabled = false;

    					lesCreneaux.creneaux.forEach((leCreneau, index) => {
    						if (leCreneau.checked) {
    							listeChecked.push({
    								"debut": leCreneau.debut,
    								"fin": leCreneau.fin,
    								index
    							});
    						}

    						if (listeChecked.length > 0 && leCreneau.estReserve) {
    							if (index < listeChecked[0].index && index > indexMinReserve) indexMinReserve = index;
    							if (index > listeChecked[0].index && index < indexMaxReserve) indexMaxReserve = index;
    						}
    					});

    					if (listeChecked.length > 0) {
    						lesCreneaux.creneaux.forEach((leCreneau, index) => {
    							if (leCreneau.estReserve) {
    								if (index < listeChecked[0].index && index > indexMinReserve) indexMinReserve = index;
    								if (index > listeChecked[0].index && index < indexMaxReserve) indexMaxReserve = index;
    							}
    						});
    					}

    					if (listeChecked.length === 0) {
    						flagDisabled = false;
    						$$invalidate(6, choixHoraire.debut = "", choixHoraire);
    						$$invalidate(6, choixHoraire.fin = "", choixHoraire);
    						$$invalidate(6, choixHoraire.choixOK = false, choixHoraire);
    					} else {
    						$$invalidate(6, choixHoraire.debut = listeChecked[0].debut, choixHoraire);
    						$$invalidate(6, choixHoraire.fin = listeChecked[listeChecked.length - 1].fin, choixHoraire);
    						verifChoix();

    						lesCreneaux.creneaux.forEach((leCreneau, index) => {
    							if (index < indexMinReserve || index > indexMaxReserve) {
    								flagDisabled = true;
    								leCreneau.disabled = true;
    							} else {
    								if (!leCreneau.checked && !leCreneau.estReserve) leCreneau.disabled = false;
    							}
    						});
    					}

    					lesCreneaux.creneaux.forEach((leCreneau, index) => {
    						if (leCreneau.checked) {
    							leCreneau.class = "text-bleuLBF";
    						} else {
    							if (!leCreneau.estReserve && !flagDisabled) {
    								leCreneau.disabled = false;
    							}

    							leCreneau.class = "text-gray-800";
    						}
    					});
    				});
    			}
    		}
    	};

    	return [
    		userInfo,
    		donneesUtilisateur,
    		nouvelleReservation,
    		afficheCalendar,
    		dateChoisie,
    		creneauxDuJour,
    		choixHoraire,
    		aujourdhui,
    		dateFinCalendrier,
    		creneauDispo,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler,
    		radiobouton_selected_binding,
    		radiobouton_selected_binding_1,
    		radiobouton_selected_binding_2,
    		radiobouton_selected_binding_3,
    		radiobouton_selected_binding_4,
    		datepicker_selected_binding,
    		checkbox_checked_binding,
    		checkbox_disabled_binding
    	];
    }

    class ReservationsMachines extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {}, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ReservationsMachines",
    			options,
    			id: create_fragment$8.name
    		});
    	}
    }

    const app = new ReservationsMachines({
      target: document.querySelector("#bobby"),
      props: {
        name: "bobby"
      }
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
