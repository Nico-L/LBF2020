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
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
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

    const globals = (typeof window !== 'undefined' ? window : global);

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

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function __spreadArrays() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    }

    var n,u,i,t,r,o,f,e={},c=[],s=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord/i;function a(n,l){for(var u in l)n[u]=l[u];return n}function v(n){var l=n.parentNode;l&&l.removeChild(n);}function h(n,l,u){var i,t=arguments,r={};for(i in l)"key"!==i&&"ref"!==i&&(r[i]=l[i]);if(arguments.length>3)for(u=[u],i=3;i<arguments.length;i++)u.push(t[i]);if(null!=u&&(r.children=u),"function"==typeof n&&null!=n.defaultProps)for(i in n.defaultProps)void 0===r[i]&&(r[i]=n.defaultProps[i]);return p(n,r,l&&l.key,l&&l.ref,null)}function p(l,u,i,t,r){var o={type:l,props:u,key:i,ref:t,__k:null,__:null,__b:0,__e:null,__d:void 0,__c:null,constructor:void 0,__v:r};return null==r&&(o.__v=o),n.vnode&&n.vnode(o),o}function y(){return {}}function d(n){return n.children}function m(n,l){this.props=n,this.context=l;}function w(n,l){if(null==l)return n.__?w(n.__,n.__.__k.indexOf(n)+1):null;for(var u;l<n.__k.length;l++)if(null!=(u=n.__k[l])&&null!=u.__e)return u.__e;return "function"==typeof n.type?w(n):null}function k(n){var l,u;if(null!=(n=n.__)&&null!=n.__c){for(n.__e=n.__c.base=null,l=0;l<n.__k.length;l++)if(null!=(u=n.__k[l])&&null!=u.__e){n.__e=n.__c.base=u.__e;break}return k(n)}}function g(l){(!l.__d&&(l.__d=!0)&&u.push(l)&&!i++||r!==n.debounceRendering)&&((r=n.debounceRendering)||t)(_);}function _(){for(var n;i=u.length;)n=u.sort(function(n,l){return n.__v.__b-l.__v.__b}),u=[],n.some(function(n){var l,u,i,t,r,o,f;n.__d&&(o=(r=(l=n).__v).__e,(f=l.__P)&&(u=[],(i=a({},r)).__v=i,t=A(f,r,i,l.__n,void 0!==f.ownerSVGElement,null,u,null==o?w(r):o),T(u,r),t!=o&&k(r)));});}function b(n,l,u,i,t,r,o,f,s){var a,h,p,y,d,m,k,g=u&&u.__k||c,_=g.length;if(f==e&&(f=null!=r?r[0]:_?w(u,0):null),a=0,l.__k=x(l.__k,function(u){if(null!=u){if(u.__=l,u.__b=l.__b+1,null===(p=g[a])||p&&u.key==p.key&&u.type===p.type)g[a]=void 0;else for(h=0;h<_;h++){if((p=g[h])&&u.key==p.key&&u.type===p.type){g[h]=void 0;break}p=null;}if(y=A(n,u,p=p||e,i,t,r,o,f,s),(h=u.ref)&&p.ref!=h&&(k||(k=[]),p.ref&&k.push(p.ref,null,u),k.push(h,u.__c||y,u)),null!=y){var c;if(null==m&&(m=y),void 0!==u.__d)c=u.__d,u.__d=void 0;else if(r==p||y!=f||null==y.parentNode){n:if(null==f||f.parentNode!==n)n.appendChild(y),c=null;else{for(d=f,h=0;(d=d.nextSibling)&&h<_;h+=2)if(d==y)break n;n.insertBefore(y,f),c=f;}"option"==l.type&&(n.value="");}f=void 0!==c?c:y.nextSibling,"function"==typeof l.type&&(l.__d=f);}else f&&p.__e==f&&f.parentNode!=n&&(f=w(p));}return a++,u}),l.__e=m,null!=r&&"function"!=typeof l.type)for(a=r.length;a--;)null!=r[a]&&v(r[a]);for(a=_;a--;)null!=g[a]&&D(g[a],g[a]);if(k)for(a=0;a<k.length;a++)j(k[a],k[++a],k[++a]);}function x(n,l,u){if(null==u&&(u=[]),null==n||"boolean"==typeof n)l&&u.push(l(null));else if(Array.isArray(n))for(var i=0;i<n.length;i++)x(n[i],l,u);else u.push(l?l("string"==typeof n||"number"==typeof n?p(null,n,null,null,n):null!=n.__e||null!=n.__c?p(n.type,n.props,n.key,null,n.__v):n):n);return u}function P(n,l,u,i,t){var r;for(r in u)"children"===r||"key"===r||r in l||N(n,r,null,u[r],i);for(r in l)t&&"function"!=typeof l[r]||"children"===r||"key"===r||"value"===r||"checked"===r||u[r]===l[r]||N(n,r,l[r],u[r],i);}function C(n,l,u){"-"===l[0]?n.setProperty(l,u):n[l]="number"==typeof u&&!1===s.test(l)?u+"px":null==u?"":u;}function N(n,l,u,i,t){var r,o,f,e,c;if(t?"className"===l&&(l="class"):"class"===l&&(l="className"),"style"===l)if(r=n.style,"string"==typeof u)r.cssText=u;else{if("string"==typeof i&&(r.cssText="",i=null),i)for(e in i)u&&e in u||C(r,e,"");if(u)for(c in u)i&&u[c]===i[c]||C(r,c,u[c]);}else"o"===l[0]&&"n"===l[1]?(o=l!==(l=l.replace(/Capture$/,"")),f=l.toLowerCase(),l=(f in n?f:l).slice(2),u?(i||n.addEventListener(l,z,o),(n.l||(n.l={}))[l]=u):n.removeEventListener(l,z,o)):"list"!==l&&"tagName"!==l&&"form"!==l&&"type"!==l&&"size"!==l&&!t&&l in n?n[l]=null==u?"":u:"function"!=typeof u&&"dangerouslySetInnerHTML"!==l&&(l!==(l=l.replace(/^xlink:?/,""))?null==u||!1===u?n.removeAttributeNS("http://www.w3.org/1999/xlink",l.toLowerCase()):n.setAttributeNS("http://www.w3.org/1999/xlink",l.toLowerCase(),u):null==u||!1===u&&!/^ar/.test(l)?n.removeAttribute(l):n.setAttribute(l,u));}function z(l){this.l[l.type](n.event?n.event(l):l);}function A(l,u,i,t,r,o,f,e,c){var s,v,h,p,y,w,k,g,_,x,P=u.type;if(void 0!==u.constructor)return null;(s=n.__b)&&s(u);try{n:if("function"==typeof P){if(g=u.props,_=(s=P.contextType)&&t[s.__c],x=s?_?_.props.value:s.__:t,i.__c?k=(v=u.__c=i.__c).__=v.__E:("prototype"in P&&P.prototype.render?u.__c=v=new P(g,x):(u.__c=v=new m(g,x),v.constructor=P,v.render=E),_&&_.sub(v),v.props=g,v.state||(v.state={}),v.context=x,v.__n=t,h=v.__d=!0,v.__h=[]),null==v.__s&&(v.__s=v.state),null!=P.getDerivedStateFromProps&&(v.__s==v.state&&(v.__s=a({},v.__s)),a(v.__s,P.getDerivedStateFromProps(g,v.__s))),p=v.props,y=v.state,h)null==P.getDerivedStateFromProps&&null!=v.componentWillMount&&v.componentWillMount(),null!=v.componentDidMount&&v.__h.push(v.componentDidMount);else{if(null==P.getDerivedStateFromProps&&g!==p&&null!=v.componentWillReceiveProps&&v.componentWillReceiveProps(g,x),!v.__e&&null!=v.shouldComponentUpdate&&!1===v.shouldComponentUpdate(g,v.__s,x)||u.__v===i.__v&&!v.__){for(v.props=g,v.state=v.__s,u.__v!==i.__v&&(v.__d=!1),v.__v=u,u.__e=i.__e,u.__k=i.__k,v.__h.length&&f.push(v),s=0;s<u.__k.length;s++)u.__k[s]&&(u.__k[s].__=u);break n}null!=v.componentWillUpdate&&v.componentWillUpdate(g,v.__s,x),null!=v.componentDidUpdate&&v.__h.push(function(){v.componentDidUpdate(p,y,w);});}v.context=x,v.props=g,v.state=v.__s,(s=n.__r)&&s(u),v.__d=!1,v.__v=u,v.__P=l,s=v.render(v.props,v.state,v.context),u.__k=null!=s&&s.type==d&&null==s.key?s.props.children:Array.isArray(s)?s:[s],null!=v.getChildContext&&(t=a(a({},t),v.getChildContext())),h||null==v.getSnapshotBeforeUpdate||(w=v.getSnapshotBeforeUpdate(p,y)),b(l,u,i,t,r,o,f,e,c),v.base=u.__e,v.__h.length&&f.push(v),k&&(v.__E=v.__=null),v.__e=!1;}else null==o&&u.__v===i.__v?(u.__k=i.__k,u.__e=i.__e):u.__e=$(i.__e,u,i,t,r,o,f,c);(s=n.diffed)&&s(u);}catch(l){u.__v=null,n.__e(l,u,i);}return u.__e}function T(l,u){n.__c&&n.__c(u,l),l.some(function(u){try{l=u.__h,u.__h=[],l.some(function(n){n.call(u);});}catch(l){n.__e(l,u.__v);}});}function $(n,l,u,i,t,r,o,f){var s,a,v,h,p,y=u.props,d=l.props;if(t="svg"===l.type||t,null!=r)for(s=0;s<r.length;s++)if(null!=(a=r[s])&&((null===l.type?3===a.nodeType:a.localName===l.type)||n==a)){n=a,r[s]=null;break}if(null==n){if(null===l.type)return document.createTextNode(d);n=t?document.createElementNS("http://www.w3.org/2000/svg",l.type):document.createElement(l.type,d.is&&{is:d.is}),r=null,f=!1;}if(null===l.type)y!==d&&n.data!=d&&(n.data=d);else{if(null!=r&&(r=c.slice.call(n.childNodes)),v=(y=u.props||e).dangerouslySetInnerHTML,h=d.dangerouslySetInnerHTML,!f){if(y===e)for(y={},p=0;p<n.attributes.length;p++)y[n.attributes[p].name]=n.attributes[p].value;(h||v)&&(h&&v&&h.__html==v.__html||(n.innerHTML=h&&h.__html||""));}P(n,d,y,t,f),h?l.__k=[]:(l.__k=l.props.children,b(n,l,u,i,"foreignObject"!==l.type&&t,r,o,e,f)),f||("value"in d&&void 0!==(s=d.value)&&s!==n.value&&N(n,"value",s,y.value,!1),"checked"in d&&void 0!==(s=d.checked)&&s!==n.checked&&N(n,"checked",s,y.checked,!1));}return n}function j(l,u,i){try{"function"==typeof l?l(u):l.current=u;}catch(l){n.__e(l,i);}}function D(l,u,i){var t,r,o;if(n.unmount&&n.unmount(l),(t=l.ref)&&(t.current&&t.current!==l.__e||j(t,null,u)),i||"function"==typeof l.type||(i=null!=(r=l.__e)),l.__e=l.__d=void 0,null!=(t=l.__c)){if(t.componentWillUnmount)try{t.componentWillUnmount();}catch(l){n.__e(l,u);}t.base=t.__P=null;}if(t=l.__k)for(o=0;o<t.length;o++)t[o]&&D(t[o],u,i);null!=r&&v(r);}function E(n,l,u){return this.constructor(n,u)}function H(l,u,i){var t,r,f;n.__&&n.__(l,u),r=(t=i===o)?null:i&&i.__k||u.__k,l=h(d,null,[l]),f=[],A(u,(t?u:i||u).__k=l,r||e,e,void 0!==u.ownerSVGElement,i&&!t?[i]:r?null:c.slice.call(u.childNodes),f,i||e,t),T(f,l);}function M(n){var l={},u={__c:"__cC"+f++,__:n,Consumer:function(n,l){return n.children(l)},Provider:function(n){var i,t=this;return this.getChildContext||(i=[],this.getChildContext=function(){return l[u.__c]=t,l},this.shouldComponentUpdate=function(n){t.props.value!==n.value&&i.some(function(l){l.context=n.value,g(l);});},this.sub=function(n){i.push(n);var l=n.componentWillUnmount;n.componentWillUnmount=function(){i.splice(i.indexOf(n),1),l&&l.call(n);};}),n.children}};return u.Consumer.contextType=u,u.Provider.__=u,u}n={__e:function(n,l){for(var u,i;l=l.__;)if((u=l.__c)&&!u.__)try{if(u.constructor&&null!=u.constructor.getDerivedStateFromError&&(i=!0,u.setState(u.constructor.getDerivedStateFromError(n))),null!=u.componentDidCatch&&(i=!0,u.componentDidCatch(n)),i)return g(u.__E=u)}catch(l){n=l;}throw n}},m.prototype.setState=function(n,l){var u;u=this.__s!==this.state?this.__s:this.__s=a({},this.state),"function"==typeof n&&(n=n(u,this.props)),n&&a(u,n),null!=n&&this.__v&&(l&&this.__h.push(l),g(this));},m.prototype.forceUpdate=function(n){this.__v&&(this.__e=!0,n&&this.__h.push(n),g(this));},m.prototype.render=d,u=[],i=0,t="function"==typeof Promise?Promise.prototype.then.bind(Promise.resolve()):setTimeout,o=e,f=0;//# sourceMappingURL=preact.module.js.map

    /*!
    FullCalendar Core Package v5.0.0-beta.2
    Docs & License: https://fullcalendar.io/
    (c) 2019 Adam Shaw
    */

    // TODO: new util arrayify?
    function removeExact(array, exactVal) {
        var removeCnt = 0;
        var i = 0;
        while (i < array.length) {
            if (array[i] === exactVal) {
                array.splice(i, 1);
                removeCnt++;
            }
            else {
                i++;
            }
        }
        return removeCnt;
    }
    function isArraysEqual(a0, a1, equalityFunc) {
        if (a0 === a1) {
            return true;
        }
        var len = a0.length;
        var i;
        if (len !== a1.length) { // not array? or not same length?
            return false;
        }
        for (i = 0; i < len; i++) {
            if (!(equalityFunc ? equalityFunc(a0[i], a1[i]) : a0[i] === a1[i])) {
                return false;
            }
        }
        return true;
    }
    function removeElement(el) {
        if (el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }
    function injectHtml(el, html) {
        el.innerHTML = html;
    }
    function injectDomNodes(el, domNodes) {
        var oldNodes = Array.prototype.slice.call(el.childNodes); // TODO: use array util
        var newNodes = Array.prototype.slice.call(domNodes); // TODO: use array util
        if (!isArraysEqual(oldNodes, newNodes)) {
            for (var _i = 0, newNodes_1 = newNodes; _i < newNodes_1.length; _i++) {
                var newNode = newNodes_1[_i];
                el.appendChild(newNode);
            }
            oldNodes.forEach(removeElement);
        }
    }
    // Querying
    // ----------------------------------------------------------------------------------------------------------------
    // from https://developer.mozilla.org/en-US/docs/Web/API/Element/closest
    var matchesMethod = Element.prototype.matches ||
        Element.prototype.matchesSelector ||
        Element.prototype.msMatchesSelector;
    var closestMethod = Element.prototype.closest || function (selector) {
        // polyfill
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (elementMatches(el, selector)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
    function elementClosest(el, selector) {
        return closestMethod.call(el, selector);
    }
    function elementMatches(el, selector) {
        return matchesMethod.call(el, selector);
    }
    // accepts multiple subject els
    // returns a real array. good for methods like forEach
    function findElements(container, selector) {
        var containers = container instanceof HTMLElement ? [container] : container;
        var allMatches = [];
        for (var i = 0; i < containers.length; i++) {
            var matches = containers[i].querySelectorAll(selector);
            for (var j = 0; j < matches.length; j++) {
                allMatches.push(matches[j]);
            }
        }
        return allMatches;
    }
    // Style
    // ----------------------------------------------------------------------------------------------------------------
    var PIXEL_PROP_RE = /(top|left|right|bottom|width|height)$/i;
    function applyStyle(el, props) {
        for (var propName in props) {
            applyStyleProp(el, propName, props[propName]);
        }
    }
    function applyStyleProp(el, name, val) {
        if (val == null) {
            el.style[name] = '';
        }
        else if (typeof val === 'number' && PIXEL_PROP_RE.test(name)) {
            el.style[name] = val + 'px';
        }
        else {
            el.style[name] = val;
        }
    }

    // Stops a mouse/touch event from doing it's native browser action
    function preventDefault(ev) {
        ev.preventDefault();
    }
    // Event Delegation
    // ----------------------------------------------------------------------------------------------------------------
    function buildDelegationHandler(selector, handler) {
        return function (ev) {
            var matchedChild = elementClosest(ev.target, selector);
            if (matchedChild) {
                handler.call(matchedChild, ev, matchedChild);
            }
        };
    }
    function listenBySelector(container, eventType, selector, handler) {
        var attachedHandler = buildDelegationHandler(selector, handler);
        container.addEventListener(eventType, attachedHandler);
        return function () {
            container.removeEventListener(eventType, attachedHandler);
        };
    }
    function listenToHoverBySelector(container, selector, onMouseEnter, onMouseLeave) {
        var currentMatchedChild;
        return listenBySelector(container, 'mouseover', selector, function (ev, matchedChild) {
            if (matchedChild !== currentMatchedChild) {
                currentMatchedChild = matchedChild;
                onMouseEnter(ev, matchedChild);
                var realOnMouseLeave_1 = function (ev) {
                    currentMatchedChild = null;
                    onMouseLeave(ev, matchedChild);
                    matchedChild.removeEventListener('mouseleave', realOnMouseLeave_1);
                };
                // listen to the next mouseleave, and then unattach
                matchedChild.addEventListener('mouseleave', realOnMouseLeave_1);
            }
        });
    }
    // Animation
    // ----------------------------------------------------------------------------------------------------------------
    var transitionEventNames = [
        'webkitTransitionEnd',
        'otransitionend',
        'oTransitionEnd',
        'msTransitionEnd',
        'transitionend'
    ];
    // triggered only when the next single subsequent transition finishes
    function whenTransitionDone(el, callback) {
        var realCallback = function (ev) {
            callback(ev);
            transitionEventNames.forEach(function (eventName) {
                el.removeEventListener(eventName, realCallback);
            });
        };
        transitionEventNames.forEach(function (eventName) {
            el.addEventListener(eventName, realCallback); // cross-browser way to determine when the transition finishes
        });
    }

    var DAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    // Adding
    function addWeeks(m, n) {
        var a = dateToUtcArray(m);
        a[2] += n * 7;
        return arrayToUtcDate(a);
    }
    function addDays(m, n) {
        var a = dateToUtcArray(m);
        a[2] += n;
        return arrayToUtcDate(a);
    }
    function addMs(m, n) {
        var a = dateToUtcArray(m);
        a[6] += n;
        return arrayToUtcDate(a);
    }
    // Diffing (all return floats)
    // TODO: why not use ranges?
    function diffWeeks(m0, m1) {
        return diffDays(m0, m1) / 7;
    }
    function diffDays(m0, m1) {
        return (m1.valueOf() - m0.valueOf()) / (1000 * 60 * 60 * 24);
    }
    function diffHours(m0, m1) {
        return (m1.valueOf() - m0.valueOf()) / (1000 * 60 * 60);
    }
    function diffMinutes(m0, m1) {
        return (m1.valueOf() - m0.valueOf()) / (1000 * 60);
    }
    function diffSeconds(m0, m1) {
        return (m1.valueOf() - m0.valueOf()) / 1000;
    }
    function diffDayAndTime(m0, m1) {
        var m0day = startOfDay(m0);
        var m1day = startOfDay(m1);
        return {
            years: 0,
            months: 0,
            days: Math.round(diffDays(m0day, m1day)),
            milliseconds: (m1.valueOf() - m1day.valueOf()) - (m0.valueOf() - m0day.valueOf())
        };
    }
    // Diffing Whole Units
    function diffWholeWeeks(m0, m1) {
        var d = diffWholeDays(m0, m1);
        if (d !== null && d % 7 === 0) {
            return d / 7;
        }
        return null;
    }
    function diffWholeDays(m0, m1) {
        if (timeAsMs(m0) === timeAsMs(m1)) {
            return Math.round(diffDays(m0, m1));
        }
        return null;
    }
    // Start-Of
    function startOfDay(m) {
        return arrayToUtcDate([
            m.getUTCFullYear(),
            m.getUTCMonth(),
            m.getUTCDate()
        ]);
    }
    function startOfHour(m) {
        return arrayToUtcDate([
            m.getUTCFullYear(),
            m.getUTCMonth(),
            m.getUTCDate(),
            m.getUTCHours()
        ]);
    }
    function startOfMinute(m) {
        return arrayToUtcDate([
            m.getUTCFullYear(),
            m.getUTCMonth(),
            m.getUTCDate(),
            m.getUTCHours(),
            m.getUTCMinutes()
        ]);
    }
    function startOfSecond(m) {
        return arrayToUtcDate([
            m.getUTCFullYear(),
            m.getUTCMonth(),
            m.getUTCDate(),
            m.getUTCHours(),
            m.getUTCMinutes(),
            m.getUTCSeconds()
        ]);
    }
    // Week Computation
    function weekOfYear(marker, dow, doy) {
        var y = marker.getUTCFullYear();
        var w = weekOfGivenYear(marker, y, dow, doy);
        if (w < 1) {
            return weekOfGivenYear(marker, y - 1, dow, doy);
        }
        var nextW = weekOfGivenYear(marker, y + 1, dow, doy);
        if (nextW >= 1) {
            return Math.min(w, nextW);
        }
        return w;
    }
    function weekOfGivenYear(marker, year, dow, doy) {
        var firstWeekStart = arrayToUtcDate([year, 0, 1 + firstWeekOffset(year, dow, doy)]);
        var dayStart = startOfDay(marker);
        var days = Math.round(diffDays(firstWeekStart, dayStart));
        return Math.floor(days / 7) + 1; // zero-indexed
    }
    // start-of-first-week - start-of-year
    function firstWeekOffset(year, dow, doy) {
        // first-week day -- which january is always in the first week (4 for iso, 1 for other)
        var fwd = 7 + dow - doy;
        // first-week day local weekday -- which local weekday is fwd
        var fwdlw = (7 + arrayToUtcDate([year, 0, fwd]).getUTCDay() - dow) % 7;
        return -fwdlw + fwd - 1;
    }
    // Array Conversion
    function dateToLocalArray(date) {
        return [
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            date.getHours(),
            date.getMinutes(),
            date.getSeconds(),
            date.getMilliseconds()
        ];
    }
    function arrayToLocalDate(a) {
        return new Date(a[0], a[1] || 0, a[2] == null ? 1 : a[2], // day of month
        a[3] || 0, a[4] || 0, a[5] || 0);
    }
    function dateToUtcArray(date) {
        return [
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds()
        ];
    }
    function arrayToUtcDate(a) {
        // according to web standards (and Safari), a month index is required.
        // massage if only given a year.
        if (a.length === 1) {
            a = a.concat([0]);
        }
        return new Date(Date.UTC.apply(Date, a));
    }
    // Other Utils
    function isValidDate(m) {
        return !isNaN(m.valueOf());
    }
    function timeAsMs(m) {
        return m.getUTCHours() * 1000 * 60 * 60 +
            m.getUTCMinutes() * 1000 * 60 +
            m.getUTCSeconds() * 1000 +
            m.getUTCMilliseconds();
    }

    var INTERNAL_UNITS = ['years', 'months', 'days', 'milliseconds'];
    var PARSE_RE = /^(-?)(?:(\d+)\.)?(\d+):(\d\d)(?::(\d\d)(?:\.(\d\d\d))?)?/;
    // Parsing and Creation
    function createDuration(input, unit) {
        var _a;
        if (typeof input === 'string') {
            return parseString(input);
        }
        else if (typeof input === 'object' && input) { // non-null object
            return normalizeObject(input);
        }
        else if (typeof input === 'number') {
            return normalizeObject((_a = {}, _a[unit || 'milliseconds'] = input, _a));
        }
        else {
            return null;
        }
    }
    function parseString(s) {
        var m = PARSE_RE.exec(s);
        if (m) {
            var sign = m[1] ? -1 : 1;
            return {
                years: 0,
                months: 0,
                days: sign * (m[2] ? parseInt(m[2], 10) : 0),
                milliseconds: sign * ((m[3] ? parseInt(m[3], 10) : 0) * 60 * 60 * 1000 + // hours
                    (m[4] ? parseInt(m[4], 10) : 0) * 60 * 1000 + // minutes
                    (m[5] ? parseInt(m[5], 10) : 0) * 1000 + // seconds
                    (m[6] ? parseInt(m[6], 10) : 0) // ms
                )
            };
        }
        return null;
    }
    function normalizeObject(obj) {
        return {
            years: obj.years || obj.year || 0,
            months: obj.months || obj.month || 0,
            days: (obj.days || obj.day || 0) +
                getWeeksFromInput(obj) * 7,
            milliseconds: (obj.hours || obj.hour || 0) * 60 * 60 * 1000 + // hours
                (obj.minutes || obj.minute || 0) * 60 * 1000 + // minutes
                (obj.seconds || obj.second || 0) * 1000 + // seconds
                (obj.milliseconds || obj.millisecond || obj.ms || 0) // ms
        };
    }
    function getWeeksFromInput(obj) {
        return obj.weeks || obj.week || 0;
    }
    // Equality
    function durationsEqual(d0, d1) {
        return d0.years === d1.years &&
            d0.months === d1.months &&
            d0.days === d1.days &&
            d0.milliseconds === d1.milliseconds;
    }
    // Simple Math
    function addDurations(d0, d1) {
        return {
            years: d0.years + d1.years,
            months: d0.months + d1.months,
            days: d0.days + d1.days,
            milliseconds: d0.milliseconds + d1.milliseconds
        };
    }
    function subtractDurations(d1, d0) {
        return {
            years: d1.years - d0.years,
            months: d1.months - d0.months,
            days: d1.days - d0.days,
            milliseconds: d1.milliseconds - d0.milliseconds
        };
    }
    function multiplyDuration(d, n) {
        return {
            years: d.years * n,
            months: d.months * n,
            days: d.days * n,
            milliseconds: d.milliseconds * n
        };
    }
    // Conversions
    // "Rough" because they are based on average-case Gregorian months/years
    function asRoughYears(dur) {
        return asRoughDays(dur) / 365;
    }
    function asRoughMonths(dur) {
        return asRoughDays(dur) / 30;
    }
    function asRoughDays(dur) {
        return asRoughMs(dur) / 864e5;
    }
    function asRoughMs(dur) {
        return dur.years * (365 * 864e5) +
            dur.months * (30 * 864e5) +
            dur.days * 864e5 +
            dur.milliseconds;
    }
    // Advanced Math
    function wholeDivideDurations(numerator, denominator) {
        var res = null;
        for (var i = 0; i < INTERNAL_UNITS.length; i++) {
            var unit = INTERNAL_UNITS[i];
            if (denominator[unit]) {
                var localRes = numerator[unit] / denominator[unit];
                if (!isInt(localRes) || (res !== null && res !== localRes)) {
                    return null;
                }
                res = localRes;
            }
            else if (numerator[unit]) {
                // needs to divide by something but can't!
                return null;
            }
        }
        return res;
    }
    function greatestDurationDenominator(dur, dontReturnWeeks) {
        var ms = dur.milliseconds;
        if (ms) {
            if (ms % 1000 !== 0) {
                return { unit: 'millisecond', value: ms };
            }
            if (ms % (1000 * 60) !== 0) {
                return { unit: 'second', value: ms / 1000 };
            }
            if (ms % (1000 * 60 * 60) !== 0) {
                return { unit: 'minute', value: ms / (1000 * 60) };
            }
            if (ms) {
                return { unit: 'hour', value: ms / (1000 * 60 * 60) };
            }
        }
        if (dur.days) {
            if (!dontReturnWeeks && dur.days % 7 === 0) {
                return { unit: 'week', value: dur.days / 7 };
            }
            return { unit: 'day', value: dur.days };
        }
        if (dur.months) {
            return { unit: 'month', value: dur.months };
        }
        if (dur.years) {
            return { unit: 'year', value: dur.years };
        }
        return { unit: 'millisecond', value: 0 };
    }

    var guidNumber = 0;
    function guid() {
        return String(guidNumber++);
    }
    /* FullCalendar-specific DOM Utilities
    ----------------------------------------------------------------------------------------------------------------------*/
    // Make the mouse cursor express that an event is not allowed in the current area
    function disableCursor() {
        document.body.classList.add('fc-not-allowed');
    }
    // Returns the mouse cursor to its original look
    function enableCursor() {
        document.body.classList.remove('fc-not-allowed');
    }
    /* Selection
    ----------------------------------------------------------------------------------------------------------------------*/
    function preventSelection(el) {
        el.classList.add('fc-unselectable');
        el.addEventListener('selectstart', preventDefault);
    }
    function allowSelection(el) {
        el.classList.remove('fc-unselectable');
        el.removeEventListener('selectstart', preventDefault);
    }
    /* Context Menu
    ----------------------------------------------------------------------------------------------------------------------*/
    function preventContextMenu(el) {
        el.addEventListener('contextmenu', preventDefault);
    }
    function allowContextMenu(el) {
        el.removeEventListener('contextmenu', preventDefault);
    }
    function parseFieldSpecs(input) {
        var specs = [];
        var tokens = [];
        var i;
        var token;
        if (typeof input === 'string') {
            tokens = input.split(/\s*,\s*/);
        }
        else if (typeof input === 'function') {
            tokens = [input];
        }
        else if (Array.isArray(input)) {
            tokens = input;
        }
        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            if (typeof token === 'string') {
                specs.push(token.charAt(0) === '-' ?
                    { field: token.substring(1), order: -1 } :
                    { field: token, order: 1 });
            }
            else if (typeof token === 'function') {
                specs.push({ func: token });
            }
        }
        return specs;
    }
    function compareByFieldSpecs(obj0, obj1, fieldSpecs) {
        var i;
        var cmp;
        for (i = 0; i < fieldSpecs.length; i++) {
            cmp = compareByFieldSpec(obj0, obj1, fieldSpecs[i]);
            if (cmp) {
                return cmp;
            }
        }
        return 0;
    }
    function compareByFieldSpec(obj0, obj1, fieldSpec) {
        if (fieldSpec.func) {
            return fieldSpec.func(obj0, obj1);
        }
        return flexibleCompare(obj0[fieldSpec.field], obj1[fieldSpec.field])
            * (fieldSpec.order || 1);
    }
    function flexibleCompare(a, b) {
        if (!a && !b) {
            return 0;
        }
        if (b == null) {
            return -1;
        }
        if (a == null) {
            return 1;
        }
        if (typeof a === 'string' || typeof b === 'string') {
            return String(a).localeCompare(String(b));
        }
        return a - b;
    }
    /* String Utilities
    ----------------------------------------------------------------------------------------------------------------------*/
    function capitaliseFirstLetter(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    function padStart(val, len) {
        var s = String(val);
        return '000'.substr(0, len - s.length) + s;
    }
    /* Number Utilities
    ----------------------------------------------------------------------------------------------------------------------*/
    function compareNumbers(a, b) {
        return a - b;
    }
    function isInt(n) {
        return n % 1 === 0;
    }
    /* Weird Utilities
    ----------------------------------------------------------------------------------------------------------------------*/
    function applyAll(functions, thisObj, args) {
        if (typeof functions === 'function') { // supplied a single function
            functions = [functions];
        }
        if (functions) {
            var i = void 0;
            var ret = void 0;
            for (i = 0; i < functions.length; i++) {
                ret = functions[i].apply(thisObj, args) || ret;
            }
            return ret;
        }
    }
    function firstDefined() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        for (var i = 0; i < args.length; i++) {
            if (args[i] !== undefined) {
                return args[i];
            }
        }
    }
    // Number and Boolean are only types that defaults or not computed for
    // TODO: write more comments
    function refineProps(rawProps, processors, defaults, leftoverProps) {
        if (defaults === void 0) { defaults = {}; }
        var refined = {};
        for (var key in processors) {
            var processor = processors[key];
            if (rawProps[key] !== undefined) {
                // found
                if (processor === Function) {
                    refined[key] = typeof rawProps[key] === 'function' ? rawProps[key] : null;
                }
                else if (processor) { // a refining function?
                    refined[key] = processor(rawProps[key]);
                }
                else {
                    refined[key] = rawProps[key];
                }
            }
            else if (defaults[key] !== undefined) {
                // there's an explicit default
                refined[key] = defaults[key];
            }
            else {
                // must compute a default
                if (processor === String) {
                    refined[key] = ''; // empty string is default for String
                }
                else if (!processor || processor === Number || processor === Boolean || processor === Function) {
                    refined[key] = null; // assign null for other non-custom processor funcs
                }
                else {
                    refined[key] = processor(null); // run the custom processor func
                }
            }
        }
        if (leftoverProps) {
            for (var key in rawProps) {
                if (processors[key] === undefined) {
                    leftoverProps[key] = rawProps[key];
                }
            }
        }
        return refined;
    }
    /* Date stuff that doesn't belong in datelib core
    ----------------------------------------------------------------------------------------------------------------------*/
    // given a timed range, computes an all-day range that has the same exact duration,
    // but whose start time is aligned with the start of the day.
    function computeAlignedDayRange(timedRange) {
        var dayCnt = Math.floor(diffDays(timedRange.start, timedRange.end)) || 1;
        var start = startOfDay(timedRange.start);
        var end = addDays(start, dayCnt);
        return { start: start, end: end };
    }
    // given a timed range, computes an all-day range based on how for the end date bleeds into the next day
    // TODO: give nextDayThreshold a default arg
    function computeVisibleDayRange(timedRange, nextDayThreshold) {
        if (nextDayThreshold === void 0) { nextDayThreshold = createDuration(0); }
        var startDay = null;
        var endDay = null;
        if (timedRange.end) {
            endDay = startOfDay(timedRange.end);
            var endTimeMS = timedRange.end.valueOf() - endDay.valueOf(); // # of milliseconds into `endDay`
            // If the end time is actually inclusively part of the next day and is equal to or
            // beyond the next day threshold, adjust the end to be the exclusive end of `endDay`.
            // Otherwise, leaving it as inclusive will cause it to exclude `endDay`.
            if (endTimeMS && endTimeMS >= asRoughMs(nextDayThreshold)) {
                endDay = addDays(endDay, 1);
            }
        }
        if (timedRange.start) {
            startDay = startOfDay(timedRange.start); // the beginning of the day the range starts
            // If end is within `startDay` but not past nextDayThreshold, assign the default duration of one day.
            if (endDay && endDay <= startDay) {
                endDay = addDays(startDay, 1);
            }
        }
        return { start: startDay, end: endDay };
    }
    function diffDates(date0, date1, dateEnv, largeUnit) {
        if (largeUnit === 'year') {
            return createDuration(dateEnv.diffWholeYears(date0, date1), 'year');
        }
        else if (largeUnit === 'month') {
            return createDuration(dateEnv.diffWholeMonths(date0, date1), 'month');
        }
        else {
            return diffDayAndTime(date0, date1); // returns a duration
        }
    }
    /* FC-specific DOM dimension stuff
    ----------------------------------------------------------------------------------------------------------------------*/
    function computeSmallestCellWidth(cellEl) {
        var allWidthEl = cellEl.querySelector('.fc-scrollgrid-shrink-frame');
        var contentWidthEl = cellEl.querySelector('.fc-scrollgrid-shrink-cushion');
        if (!allWidthEl) {
            throw new Error('needs fc-scrollgrid-shrink-frame className'); // TODO: use const
        }
        if (!contentWidthEl) {
            throw new Error('needs fc-scrollgrid-shrink-cushion className');
        }
        return cellEl.getBoundingClientRect().width - allWidthEl.getBoundingClientRect().width + // the cell padding+border
            contentWidthEl.getBoundingClientRect().width;
    }

    function parseRecurring(eventInput, defaultAllDay, dateEnv, recurringTypes, leftovers) {
        for (var i = 0; i < recurringTypes.length; i++) {
            var localLeftovers = {};
            var parsed = recurringTypes[i].parse(eventInput, localLeftovers, dateEnv);
            if (parsed) {
                var allDay = localLeftovers.allDay;
                delete localLeftovers.allDay; // remove from leftovers
                if (allDay == null) {
                    allDay = defaultAllDay;
                    if (allDay == null) {
                        allDay = parsed.allDayGuess;
                        if (allDay == null) {
                            allDay = false;
                        }
                    }
                }
                __assign(leftovers, localLeftovers);
                return {
                    allDay: allDay,
                    duration: parsed.duration,
                    typeData: parsed.typeData,
                    typeId: i
                };
            }
        }
        return null;
    }
    /*
    Event MUST have a recurringDef
    */
    function expandRecurringRanges(eventDef, duration, framingRange, dateEnv, recurringTypes) {
        var typeDef = recurringTypes[eventDef.recurringDef.typeId];
        var markers = typeDef.expand(eventDef.recurringDef.typeData, {
            start: dateEnv.subtract(framingRange.start, duration),
            end: framingRange.end
        }, dateEnv);
        // the recurrence plugins don't guarantee that all-day events are start-of-day, so we have to
        if (eventDef.allDay) {
            markers = markers.map(startOfDay);
        }
        return markers;
    }

    var hasOwnProperty = Object.prototype.hasOwnProperty;
    // Merges an array of objects into a single object.
    // The second argument allows for an array of property names who's object values will be merged together.
    function mergeProps(propObjs, complexProps) {
        var dest = {};
        var i;
        var name;
        var complexObjs;
        var j;
        var val;
        var props;
        if (complexProps) {
            for (i = 0; i < complexProps.length; i++) {
                name = complexProps[i];
                complexObjs = [];
                // collect the trailing object values, stopping when a non-object is discovered
                for (j = propObjs.length - 1; j >= 0; j--) {
                    val = propObjs[j][name];
                    if (typeof val === 'object' && val) { // non-null object
                        complexObjs.unshift(val);
                    }
                    else if (val !== undefined) {
                        dest[name] = val; // if there were no objects, this value will be used
                        break;
                    }
                }
                // if the trailing values were objects, use the merged value
                if (complexObjs.length) {
                    dest[name] = mergeProps(complexObjs);
                }
            }
        }
        // copy values into the destination, going from last to first
        for (i = propObjs.length - 1; i >= 0; i--) {
            props = propObjs[i];
            for (name in props) {
                if (!(name in dest)) { // if already assigned by previous props or complex props, don't reassign
                    dest[name] = props[name];
                }
            }
        }
        return dest;
    }
    function filterHash(hash, func) {
        var filtered = {};
        for (var key in hash) {
            if (func(hash[key], key)) {
                filtered[key] = hash[key];
            }
        }
        return filtered;
    }
    function mapHash(hash, func) {
        var newHash = {};
        for (var key in hash) {
            newHash[key] = func(hash[key], key);
        }
        return newHash;
    }
    function arrayToHash(a) {
        var hash = {};
        for (var _i = 0, a_1 = a; _i < a_1.length; _i++) {
            var item = a_1[_i];
            hash[item] = true;
        }
        return hash;
    }
    function hashValuesToArray(obj) {
        var a = [];
        for (var key in obj) {
            a.push(obj[key]);
        }
        return a;
    }
    function isPropsEqual(obj0, obj1) {
        if (obj0 === obj1) {
            return true;
        }
        for (var key in obj0) {
            if (hasOwnProperty.call(obj0, key)) {
                if (!(key in obj1)) {
                    return false;
                }
            }
        }
        for (var key in obj1) {
            if (hasOwnProperty.call(obj1, key)) {
                if (obj0[key] !== obj1[key]) {
                    return false;
                }
            }
        }
        return true;
    }
    function getUnequalProps(obj0, obj1) {
        var keys = [];
        for (var key in obj0) {
            if (hasOwnProperty.call(obj0, key)) {
                if (!(key in obj1)) {
                    keys.push(key);
                }
            }
        }
        for (var key in obj1) {
            if (hasOwnProperty.call(obj1, key)) {
                if (obj0[key] !== obj1[key]) {
                    keys.push(key);
                }
            }
        }
        return keys;
    }
    function compareObjs(oldProps, newProps, equalityFuncs) {
        if (equalityFuncs === void 0) { equalityFuncs = {}; }
        if (oldProps === newProps) {
            return true;
        }
        for (var key in newProps) {
            if (key in oldProps && isObjValsEqual(oldProps[key], newProps[key], equalityFuncs[key])) ;
            else {
                return false;
            }
        }
        // check for props that were omitted in the new
        for (var key in oldProps) {
            if (!(key in newProps)) {
                return false;
            }
        }
        return true;
    }
    /*
    assumed "true" equality for handler names like "onReceiveSomething"
    */
    function isObjValsEqual(val0, val1, comparator) {
        if (val0 === val1 || comparator === true) {
            return true;
        }
        if (comparator) {
            return comparator(val0, val1);
        }
        return false;
    }
    function collectFromHash(hash, startIndex, endIndex, step) {
        if (startIndex === void 0) { startIndex = 0; }
        if (step === void 0) { step = 1; }
        var res = [];
        if (endIndex == null) {
            endIndex = Object.keys(hash).length;
        }
        for (var i = startIndex; i < endIndex; i += step) {
            var val = hash[i];
            if (val !== undefined) { // will disregard undefined for sparse arrays
                res.push(val);
            }
        }
        return res;
    }

    function parseEvents(rawEvents, sourceId, calendar, allowOpenRange) {
        var eventStore = createEmptyEventStore();
        for (var _i = 0, rawEvents_1 = rawEvents; _i < rawEvents_1.length; _i++) {
            var rawEvent = rawEvents_1[_i];
            var tuple = parseEvent(rawEvent, sourceId, calendar, allowOpenRange);
            if (tuple) {
                eventTupleToStore(tuple, eventStore);
            }
        }
        return eventStore;
    }
    function eventTupleToStore(tuple, eventStore) {
        if (eventStore === void 0) { eventStore = createEmptyEventStore(); }
        eventStore.defs[tuple.def.defId] = tuple.def;
        if (tuple.instance) {
            eventStore.instances[tuple.instance.instanceId] = tuple.instance;
        }
        return eventStore;
    }
    function expandRecurring(eventStore, framingRange, calendar) {
        var dateEnv = calendar.dateEnv;
        var defs = eventStore.defs, instances = eventStore.instances;
        // remove existing recurring instances
        instances = filterHash(instances, function (instance) {
            return !defs[instance.defId].recurringDef;
        });
        for (var defId in defs) {
            var def = defs[defId];
            if (def.recurringDef) {
                var duration = def.recurringDef.duration;
                if (!duration) {
                    duration = def.allDay ?
                        calendar.defaultAllDayEventDuration :
                        calendar.defaultTimedEventDuration;
                }
                var starts = expandRecurringRanges(def, duration, framingRange, calendar.dateEnv, calendar.pluginSystem.hooks.recurringTypes);
                for (var _i = 0, starts_1 = starts; _i < starts_1.length; _i++) {
                    var start = starts_1[_i];
                    var instance = createEventInstance(defId, {
                        start: start,
                        end: dateEnv.add(start, duration)
                    });
                    instances[instance.instanceId] = instance;
                }
            }
        }
        return { defs: defs, instances: instances };
    }
    // retrieves events that have the same groupId as the instance specified by `instanceId`
    // or they are the same as the instance.
    // why might instanceId not be in the store? an event from another calendar?
    function getRelevantEvents(eventStore, instanceId) {
        var instance = eventStore.instances[instanceId];
        if (instance) {
            var def_1 = eventStore.defs[instance.defId];
            // get events/instances with same group
            var newStore = filterEventStoreDefs(eventStore, function (lookDef) {
                return isEventDefsGrouped(def_1, lookDef);
            });
            // add the original
            // TODO: wish we could use eventTupleToStore or something like it
            newStore.defs[def_1.defId] = def_1;
            newStore.instances[instance.instanceId] = instance;
            return newStore;
        }
        return createEmptyEventStore();
    }
    function isEventDefsGrouped(def0, def1) {
        return Boolean(def0.groupId && def0.groupId === def1.groupId);
    }
    function transformRawEvents(rawEvents, eventSource, calendar) {
        var calEachTransform = calendar.opt('eventDataTransform');
        var sourceEachTransform = eventSource ? eventSource.eventDataTransform : null;
        if (sourceEachTransform) {
            rawEvents = transformEachRawEvent(rawEvents, sourceEachTransform);
        }
        if (calEachTransform) {
            rawEvents = transformEachRawEvent(rawEvents, calEachTransform);
        }
        return rawEvents;
    }
    function transformEachRawEvent(rawEvents, func) {
        var refinedEvents;
        if (!func) {
            refinedEvents = rawEvents;
        }
        else {
            refinedEvents = [];
            for (var _i = 0, rawEvents_2 = rawEvents; _i < rawEvents_2.length; _i++) {
                var rawEvent = rawEvents_2[_i];
                var refinedEvent = func(rawEvent);
                if (refinedEvent) {
                    refinedEvents.push(refinedEvent);
                }
                else if (refinedEvent == null) {
                    refinedEvents.push(rawEvent);
                } // if a different falsy value, do nothing
            }
        }
        return refinedEvents;
    }
    function createEmptyEventStore() {
        return { defs: {}, instances: {} };
    }
    function mergeEventStores(store0, store1) {
        return {
            defs: __assign(__assign({}, store0.defs), store1.defs),
            instances: __assign(__assign({}, store0.instances), store1.instances)
        };
    }
    function filterEventStoreDefs(eventStore, filterFunc) {
        var defs = filterHash(eventStore.defs, filterFunc);
        var instances = filterHash(eventStore.instances, function (instance) {
            return defs[instance.defId]; // still exists?
        });
        return { defs: defs, instances: instances };
    }

    function parseRange(input, dateEnv) {
        var start = null;
        var end = null;
        if (input.start) {
            start = dateEnv.createMarker(input.start);
        }
        if (input.end) {
            end = dateEnv.createMarker(input.end);
        }
        if (!start && !end) {
            return null;
        }
        if (start && end && end < start) {
            return null;
        }
        return { start: start, end: end };
    }
    // SIDE-EFFECT: will mutate ranges.
    // Will return a new array result.
    function invertRanges(ranges, constraintRange) {
        var invertedRanges = [];
        var start = constraintRange.start; // the end of the previous range. the start of the new range
        var i;
        var dateRange;
        // ranges need to be in order. required for our date-walking algorithm
        ranges.sort(compareRanges);
        for (i = 0; i < ranges.length; i++) {
            dateRange = ranges[i];
            // add the span of time before the event (if there is any)
            if (dateRange.start > start) { // compare millisecond time (skip any ambig logic)
                invertedRanges.push({ start: start, end: dateRange.start });
            }
            if (dateRange.end > start) {
                start = dateRange.end;
            }
        }
        // add the span of time after the last event (if there is any)
        if (start < constraintRange.end) { // compare millisecond time (skip any ambig logic)
            invertedRanges.push({ start: start, end: constraintRange.end });
        }
        return invertedRanges;
    }
    function compareRanges(range0, range1) {
        return range0.start.valueOf() - range1.start.valueOf(); // earlier ranges go first
    }
    function intersectRanges(range0, range1) {
        var start = range0.start;
        var end = range0.end;
        var newRange = null;
        if (range1.start !== null) {
            if (start === null) {
                start = range1.start;
            }
            else {
                start = new Date(Math.max(start.valueOf(), range1.start.valueOf()));
            }
        }
        if (range1.end != null) {
            if (end === null) {
                end = range1.end;
            }
            else {
                end = new Date(Math.min(end.valueOf(), range1.end.valueOf()));
            }
        }
        if (start === null || end === null || start < end) {
            newRange = { start: start, end: end };
        }
        return newRange;
    }
    function rangesEqual(range0, range1) {
        return (range0.start === null ? null : range0.start.valueOf()) === (range1.start === null ? null : range1.start.valueOf()) &&
            (range0.end === null ? null : range0.end.valueOf()) === (range1.end === null ? null : range1.end.valueOf());
    }
    function rangesIntersect(range0, range1) {
        return (range0.end === null || range1.start === null || range0.end > range1.start) &&
            (range0.start === null || range1.end === null || range0.start < range1.end);
    }
    function rangeContainsRange(outerRange, innerRange) {
        return (outerRange.start === null || (innerRange.start !== null && innerRange.start >= outerRange.start)) &&
            (outerRange.end === null || (innerRange.end !== null && innerRange.end <= outerRange.end));
    }
    function rangeContainsMarker(range, date) {
        return (range.start === null || date >= range.start) &&
            (range.end === null || date < range.end);
    }
    // If the given date is not within the given range, move it inside.
    // (If it's past the end, make it one millisecond before the end).
    function constrainMarkerToRange(date, range) {
        if (range.start != null && date < range.start) {
            return range.start;
        }
        if (range.end != null && date >= range.end) {
            return new Date(range.end.valueOf() - 1);
        }
        return date;
    }

    function memoize(workerFunc, resEquality, teardownFunc) {
        var currentArgs;
        var currentRes;
        return function () {
            var newArgs = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                newArgs[_i] = arguments[_i];
            }
            if (!currentArgs) {
                currentRes = workerFunc.apply(this, newArgs);
            }
            else if (!isArraysEqual(currentArgs, newArgs)) {
                if (teardownFunc) {
                    teardownFunc(currentRes);
                }
                var res = workerFunc.apply(this, newArgs);
                if (!resEquality || !resEquality(res, currentRes)) {
                    currentRes = res;
                }
            }
            currentArgs = newArgs;
            return currentRes;
        };
    }

    var EXTENDED_SETTINGS_AND_SEVERITIES = {
        week: 3,
        separator: 0,
        omitZeroMinute: 0,
        meridiem: 0,
        omitCommas: 0
    };
    var STANDARD_DATE_PROP_SEVERITIES = {
        timeZoneName: 7,
        era: 6,
        year: 5,
        month: 4,
        day: 2,
        weekday: 2,
        hour: 1,
        minute: 1,
        second: 1
    };
    var MERIDIEM_RE = /\s*([ap])\.?m\.?/i; // eats up leading spaces too
    var COMMA_RE = /,/g; // we need re for globalness
    var MULTI_SPACE_RE = /\s+/g;
    var LTR_RE = /\u200e/g; // control character
    var UTC_RE = /UTC|GMT/;
    var NativeFormatter = /** @class */ (function () {
        function NativeFormatter(formatSettings) {
            var standardDateProps = {};
            var extendedSettings = {};
            var severity = 0;
            for (var name_1 in formatSettings) {
                if (name_1 in EXTENDED_SETTINGS_AND_SEVERITIES) {
                    extendedSettings[name_1] = formatSettings[name_1];
                    severity = Math.max(EXTENDED_SETTINGS_AND_SEVERITIES[name_1], severity);
                }
                else {
                    standardDateProps[name_1] = formatSettings[name_1];
                    if (name_1 in STANDARD_DATE_PROP_SEVERITIES) {
                        severity = Math.max(STANDARD_DATE_PROP_SEVERITIES[name_1], severity);
                    }
                }
            }
            this.standardDateProps = standardDateProps;
            this.extendedSettings = extendedSettings;
            this.severity = severity;
            this.buildFormattingFunc = memoize(buildFormattingFunc);
        }
        NativeFormatter.prototype.format = function (date, context) {
            return this.buildFormattingFunc(this.standardDateProps, this.extendedSettings, context)(date);
        };
        NativeFormatter.prototype.formatRange = function (start, end, context) {
            var _a = this, standardDateProps = _a.standardDateProps, extendedSettings = _a.extendedSettings;
            var diffSeverity = computeMarkerDiffSeverity(start.marker, end.marker, context.calendarSystem);
            if (!diffSeverity) {
                return this.format(start, context);
            }
            var biggestUnitForPartial = diffSeverity;
            if (biggestUnitForPartial > 1 && // the two dates are different in a way that's larger scale than time
                (standardDateProps.year === 'numeric' || standardDateProps.year === '2-digit') &&
                (standardDateProps.month === 'numeric' || standardDateProps.month === '2-digit') &&
                (standardDateProps.day === 'numeric' || standardDateProps.day === '2-digit')) {
                biggestUnitForPartial = 1; // make it look like the dates are only different in terms of time
            }
            var full0 = this.format(start, context);
            var full1 = this.format(end, context);
            if (full0 === full1) {
                return full0;
            }
            var partialDateProps = computePartialFormattingOptions(standardDateProps, biggestUnitForPartial);
            var partialFormattingFunc = buildFormattingFunc(partialDateProps, extendedSettings, context);
            var partial0 = partialFormattingFunc(start);
            var partial1 = partialFormattingFunc(end);
            var insertion = findCommonInsertion(full0, partial0, full1, partial1);
            var separator = extendedSettings.separator || '';
            if (insertion) {
                return insertion.before + partial0 + separator + partial1 + insertion.after;
            }
            return full0 + separator + full1;
        };
        NativeFormatter.prototype.getLargestUnit = function () {
            switch (this.severity) {
                case 7:
                case 6:
                case 5:
                    return 'year';
                case 4:
                    return 'month';
                case 3:
                    return 'week';
                case 2:
                    return 'day';
                default:
                    return 'time'; // really?
            }
        };
        return NativeFormatter;
    }());
    function buildFormattingFunc(standardDateProps, extendedSettings, context) {
        var standardDatePropCnt = Object.keys(standardDateProps).length;
        if (standardDatePropCnt === 1 && standardDateProps.timeZoneName === 'short') {
            return function (date) {
                return formatTimeZoneOffset(date.timeZoneOffset);
            };
        }
        if (standardDatePropCnt === 0 && extendedSettings.week) {
            return function (date) {
                return formatWeekNumber(context.computeWeekNumber(date.marker), context.weekText, context.locale, extendedSettings.week);
            };
        }
        return buildNativeFormattingFunc(standardDateProps, extendedSettings, context);
    }
    function buildNativeFormattingFunc(standardDateProps, extendedSettings, context) {
        standardDateProps = __assign({}, standardDateProps); // copy
        extendedSettings = __assign({}, extendedSettings); // copy
        sanitizeSettings(standardDateProps, extendedSettings);
        standardDateProps.timeZone = 'UTC'; // we leverage the only guaranteed timeZone for our UTC markers
        var normalFormat = new Intl.DateTimeFormat(context.locale.codes, standardDateProps);
        var zeroFormat; // needed?
        if (extendedSettings.omitZeroMinute) {
            var zeroProps = __assign({}, standardDateProps);
            delete zeroProps.minute; // seconds and ms were already considered in sanitizeSettings
            zeroFormat = new Intl.DateTimeFormat(context.locale.codes, zeroProps);
        }
        return function (date) {
            var marker = date.marker;
            var format;
            if (zeroFormat && !marker.getUTCMinutes()) {
                format = zeroFormat;
            }
            else {
                format = normalFormat;
            }
            var s = format.format(marker);
            return postProcess(s, date, standardDateProps, extendedSettings, context);
        };
    }
    function sanitizeSettings(standardDateProps, extendedSettings) {
        // deal with a browser inconsistency where formatting the timezone
        // requires that the hour/minute be present.
        if (standardDateProps.timeZoneName) {
            if (!standardDateProps.hour) {
                standardDateProps.hour = '2-digit';
            }
            if (!standardDateProps.minute) {
                standardDateProps.minute = '2-digit';
            }
        }
        // only support short timezone names
        if (standardDateProps.timeZoneName === 'long') {
            standardDateProps.timeZoneName = 'short';
        }
        // if requesting to display seconds, MUST display minutes
        if (extendedSettings.omitZeroMinute && (standardDateProps.second || standardDateProps.millisecond)) {
            delete extendedSettings.omitZeroMinute;
        }
    }
    function postProcess(s, date, standardDateProps, extendedSettings, context) {
        s = s.replace(LTR_RE, ''); // remove left-to-right control chars. do first. good for other regexes
        if (standardDateProps.timeZoneName === 'short') {
            s = injectTzoStr(s, (context.timeZone === 'UTC' || date.timeZoneOffset == null) ?
                'UTC' : // important to normalize for IE, which does "GMT"
                formatTimeZoneOffset(date.timeZoneOffset));
        }
        if (extendedSettings.omitCommas) {
            s = s.replace(COMMA_RE, '').trim();
        }
        if (extendedSettings.omitZeroMinute) {
            s = s.replace(':00', ''); // zeroFormat doesn't always achieve this
        }
        // ^ do anything that might create adjacent spaces before this point,
        // because MERIDIEM_RE likes to eat up loading spaces
        if (extendedSettings.meridiem === false) {
            s = s.replace(MERIDIEM_RE, '').trim();
        }
        else if (extendedSettings.meridiem === 'narrow') { // a/p
            s = s.replace(MERIDIEM_RE, function (m0, m1) {
                return m1.toLocaleLowerCase();
            });
        }
        else if (extendedSettings.meridiem === 'short') { // am/pm
            s = s.replace(MERIDIEM_RE, function (m0, m1) {
                return m1.toLocaleLowerCase() + 'm';
            });
        }
        else if (extendedSettings.meridiem === 'lowercase') { // other meridiem transformers already converted to lowercase
            s = s.replace(MERIDIEM_RE, function (m0) {
                return m0.toLocaleLowerCase();
            });
        }
        s = s.replace(MULTI_SPACE_RE, ' ');
        s = s.trim();
        return s;
    }
    function injectTzoStr(s, tzoStr) {
        var replaced = false;
        s = s.replace(UTC_RE, function () {
            replaced = true;
            return tzoStr;
        });
        // IE11 doesn't include UTC/GMT in the original string, so append to end
        if (!replaced) {
            s += ' ' + tzoStr;
        }
        return s;
    }
    function formatWeekNumber(num, weekText, locale, display) {
        var parts = [];
        if (display === 'narrow') {
            parts.push(weekText);
        }
        else if (display === 'short') {
            parts.push(weekText, ' ');
        }
        // otherwise, considered 'numeric'
        parts.push(locale.simpleNumberFormat.format(num));
        if (locale.options.isRtl) { // TODO: use control characters instead?
            parts.reverse();
        }
        return parts.join('');
    }
    // Range Formatting Utils
    // 0 = exactly the same
    // 1 = different by time
    // and bigger
    function computeMarkerDiffSeverity(d0, d1, ca) {
        if (ca.getMarkerYear(d0) !== ca.getMarkerYear(d1)) {
            return 5;
        }
        if (ca.getMarkerMonth(d0) !== ca.getMarkerMonth(d1)) {
            return 4;
        }
        if (ca.getMarkerDay(d0) !== ca.getMarkerDay(d1)) {
            return 2;
        }
        if (timeAsMs(d0) !== timeAsMs(d1)) {
            return 1;
        }
        return 0;
    }
    function computePartialFormattingOptions(options, biggestUnit) {
        var partialOptions = {};
        for (var name_2 in options) {
            if (!(name_2 in STANDARD_DATE_PROP_SEVERITIES) || // not a date part prop (like timeZone)
                STANDARD_DATE_PROP_SEVERITIES[name_2] <= biggestUnit) {
                partialOptions[name_2] = options[name_2];
            }
        }
        return partialOptions;
    }
    function findCommonInsertion(full0, partial0, full1, partial1) {
        var i0 = 0;
        while (i0 < full0.length) {
            var found0 = full0.indexOf(partial0, i0);
            if (found0 === -1) {
                break;
            }
            var before0 = full0.substr(0, found0);
            i0 = found0 + partial0.length;
            var after0 = full0.substr(i0);
            var i1 = 0;
            while (i1 < full1.length) {
                var found1 = full1.indexOf(partial1, i1);
                if (found1 === -1) {
                    break;
                }
                var before1 = full1.substr(0, found1);
                i1 = found1 + partial1.length;
                var after1 = full1.substr(i1);
                if (before0 === before1 && after0 === after1) {
                    return {
                        before: before0,
                        after: after0
                    };
                }
            }
        }
        return null;
    }

    /*
    TODO: fix the terminology of "formatter" vs "formatting func"
    */
    /*
    At the time of instantiation, this object does not know which cmd-formatting system it will use.
    It receives this at the time of formatting, as a setting.
    */
    var CmdFormatter = /** @class */ (function () {
        function CmdFormatter(cmdStr, separator) {
            this.cmdStr = cmdStr;
            this.separator = separator;
        }
        CmdFormatter.prototype.format = function (date, context) {
            return context.cmdFormatter(this.cmdStr, createVerboseFormattingArg(date, null, context, this.separator));
        };
        CmdFormatter.prototype.formatRange = function (start, end, context) {
            return context.cmdFormatter(this.cmdStr, createVerboseFormattingArg(start, end, context, this.separator));
        };
        return CmdFormatter;
    }());

    var FuncFormatter = /** @class */ (function () {
        function FuncFormatter(func) {
            this.func = func;
        }
        FuncFormatter.prototype.format = function (date, context) {
            return this.func(createVerboseFormattingArg(date, null, context));
        };
        FuncFormatter.prototype.formatRange = function (start, end, context) {
            return this.func(createVerboseFormattingArg(start, end, context));
        };
        return FuncFormatter;
    }());

    // Formatter Object Creation
    function createFormatter(input, defaultSeparator) {
        if (typeof input === 'object' && input) { // non-null object
            if (typeof defaultSeparator === 'string') {
                input = __assign({ separator: defaultSeparator }, input);
            }
            return new NativeFormatter(input);
        }
        else if (typeof input === 'string') {
            return new CmdFormatter(input, defaultSeparator);
        }
        else if (typeof input === 'function') {
            return new FuncFormatter(input);
        }
    }
    // String Utils
    // timeZoneOffset is in minutes
    function buildIsoString(marker, timeZoneOffset, stripZeroTime) {
        if (stripZeroTime === void 0) { stripZeroTime = false; }
        var s = marker.toISOString();
        s = s.replace('.000', '');
        if (stripZeroTime) {
            s = s.replace('T00:00:00Z', '');
        }
        if (s.length > 10) { // time part wasn't stripped, can add timezone info
            if (timeZoneOffset == null) {
                s = s.replace('Z', '');
            }
            else if (timeZoneOffset !== 0) {
                s = s.replace('Z', formatTimeZoneOffset(timeZoneOffset, true));
            }
            // otherwise, its UTC-0 and we want to keep the Z
        }
        return s;
    }
    // formats the date, but with no time part
    // TODO: somehow merge with buildIsoString and stripZeroTime
    // TODO: rename. omit "string"
    function formatDayString(marker) {
        return marker.toISOString().replace(/T.*$/, '');
    }
    // TODO: use Date::toISOString and use everything after the T?
    function formatIsoTimeString(marker) {
        return padStart(marker.getUTCHours(), 2) + ':' +
            padStart(marker.getUTCMinutes(), 2) + ':' +
            padStart(marker.getUTCSeconds(), 2);
    }
    function formatTimeZoneOffset(minutes, doIso) {
        if (doIso === void 0) { doIso = false; }
        var sign = minutes < 0 ? '-' : '+';
        var abs = Math.abs(minutes);
        var hours = Math.floor(abs / 60);
        var mins = Math.round(abs % 60);
        if (doIso) {
            return sign + padStart(hours, 2) + ':' + padStart(mins, 2);
        }
        else {
            return 'GMT' + sign + hours + (mins ? ':' + padStart(mins, 2) : '');
        }
    }
    // Arg Utils
    function createVerboseFormattingArg(start, end, context, separator) {
        var startInfo = expandZonedMarker(start, context.calendarSystem);
        var endInfo = end ? expandZonedMarker(end, context.calendarSystem) : null;
        return {
            date: startInfo,
            start: startInfo,
            end: endInfo,
            timeZone: context.timeZone,
            localeCodes: context.locale.codes,
            separator: separator
        };
    }
    function expandZonedMarker(dateInfo, calendarSystem) {
        var a = calendarSystem.markerToArray(dateInfo.marker);
        return {
            marker: dateInfo.marker,
            timeZoneOffset: dateInfo.timeZoneOffset,
            array: a,
            year: a[0],
            month: a[1],
            day: a[2],
            hour: a[3],
            minute: a[4],
            second: a[5],
            millisecond: a[6]
        };
    }

    var EventSourceApi = /** @class */ (function () {
        function EventSourceApi(calendar, internalEventSource) {
            this.calendar = calendar;
            this.internalEventSource = internalEventSource;
        }
        EventSourceApi.prototype.remove = function () {
            this.calendar.dispatch({
                type: 'REMOVE_EVENT_SOURCE',
                sourceId: this.internalEventSource.sourceId
            });
        };
        EventSourceApi.prototype.refetch = function () {
            this.calendar.dispatch({
                type: 'FETCH_EVENT_SOURCES',
                sourceIds: [this.internalEventSource.sourceId]
            });
        };
        Object.defineProperty(EventSourceApi.prototype, "id", {
            get: function () {
                return this.internalEventSource.publicId;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventSourceApi.prototype, "url", {
            // only relevant to json-feed event sources
            get: function () {
                return this.internalEventSource.meta.url;
            },
            enumerable: true,
            configurable: true
        });
        return EventSourceApi;
    }());

    var EventApi = /** @class */ (function () {
        function EventApi(calendar, def, instance) {
            this._calendar = calendar;
            this._def = def;
            this._instance = instance || null;
        }
        /*
        TODO: make event struct more responsible for this
        */
        EventApi.prototype.setProp = function (name, val) {
            var _a, _b;
            if (name in DATE_PROPS) ;
            else if (name in NON_DATE_PROPS) {
                if (typeof NON_DATE_PROPS[name] === 'function') {
                    val = NON_DATE_PROPS[name](val);
                }
                this.mutate({
                    standardProps: (_a = {}, _a[name] = val, _a)
                });
            }
            else if (name in UNSCOPED_EVENT_UI_PROPS) {
                var ui = void 0;
                if (typeof UNSCOPED_EVENT_UI_PROPS[name] === 'function') {
                    val = UNSCOPED_EVENT_UI_PROPS[name](val);
                }
                if (name === 'color') {
                    ui = { backgroundColor: val, borderColor: val };
                }
                else if (name === 'editable') {
                    ui = { startEditable: val, durationEditable: val };
                }
                else {
                    ui = (_b = {}, _b[name] = val, _b);
                }
                this.mutate({
                    standardProps: { ui: ui }
                });
            }
        };
        EventApi.prototype.setExtendedProp = function (name, val) {
            var _a;
            this.mutate({
                extendedProps: (_a = {}, _a[name] = val, _a)
            });
        };
        EventApi.prototype.setStart = function (startInput, options) {
            if (options === void 0) { options = {}; }
            var dateEnv = this._calendar.dateEnv;
            var start = dateEnv.createMarker(startInput);
            if (start && this._instance) { // TODO: warning if parsed bad
                var instanceRange = this._instance.range;
                var startDelta = diffDates(instanceRange.start, start, dateEnv, options.granularity); // what if parsed bad!?
                if (options.maintainDuration) {
                    this.mutate({ datesDelta: startDelta });
                }
                else {
                    this.mutate({ startDelta: startDelta });
                }
            }
        };
        EventApi.prototype.setEnd = function (endInput, options) {
            if (options === void 0) { options = {}; }
            var dateEnv = this._calendar.dateEnv;
            var end;
            if (endInput != null) {
                end = dateEnv.createMarker(endInput);
                if (!end) {
                    return; // TODO: warning if parsed bad
                }
            }
            if (this._instance) {
                if (end) {
                    var endDelta = diffDates(this._instance.range.end, end, dateEnv, options.granularity);
                    this.mutate({ endDelta: endDelta });
                }
                else {
                    this.mutate({ standardProps: { hasEnd: false } });
                }
            }
        };
        EventApi.prototype.setDates = function (startInput, endInput, options) {
            if (options === void 0) { options = {}; }
            var dateEnv = this._calendar.dateEnv;
            var standardProps = { allDay: options.allDay };
            var start = dateEnv.createMarker(startInput);
            var end;
            if (!start) {
                return; // TODO: warning if parsed bad
            }
            if (endInput != null) {
                end = dateEnv.createMarker(endInput);
                if (!end) { // TODO: warning if parsed bad
                    return;
                }
            }
            if (this._instance) {
                var instanceRange = this._instance.range;
                // when computing the diff for an event being converted to all-day,
                // compute diff off of the all-day values the way event-mutation does.
                if (options.allDay === true) {
                    instanceRange = computeAlignedDayRange(instanceRange);
                }
                var startDelta = diffDates(instanceRange.start, start, dateEnv, options.granularity);
                if (end) {
                    var endDelta = diffDates(instanceRange.end, end, dateEnv, options.granularity);
                    if (durationsEqual(startDelta, endDelta)) {
                        this.mutate({ datesDelta: startDelta, standardProps: standardProps });
                    }
                    else {
                        this.mutate({ startDelta: startDelta, endDelta: endDelta, standardProps: standardProps });
                    }
                }
                else { // means "clear the end"
                    standardProps.hasEnd = false;
                    this.mutate({ datesDelta: startDelta, standardProps: standardProps });
                }
            }
        };
        EventApi.prototype.moveStart = function (deltaInput) {
            var delta = createDuration(deltaInput);
            if (delta) { // TODO: warning if parsed bad
                this.mutate({ startDelta: delta });
            }
        };
        EventApi.prototype.moveEnd = function (deltaInput) {
            var delta = createDuration(deltaInput);
            if (delta) { // TODO: warning if parsed bad
                this.mutate({ endDelta: delta });
            }
        };
        EventApi.prototype.moveDates = function (deltaInput) {
            var delta = createDuration(deltaInput);
            if (delta) { // TODO: warning if parsed bad
                this.mutate({ datesDelta: delta });
            }
        };
        EventApi.prototype.setAllDay = function (allDay, options) {
            if (options === void 0) { options = {}; }
            var standardProps = { allDay: allDay };
            var maintainDuration = options.maintainDuration;
            if (maintainDuration == null) {
                maintainDuration = this._calendar.opt('allDayMaintainDuration');
            }
            if (this._def.allDay !== allDay) {
                standardProps.hasEnd = maintainDuration;
            }
            this.mutate({ standardProps: standardProps });
        };
        EventApi.prototype.formatRange = function (formatInput) {
            var dateEnv = this._calendar.dateEnv;
            var instance = this._instance;
            var formatter = createFormatter(formatInput, this._calendar.opt('defaultRangeSeparator'));
            if (this._def.hasEnd) {
                return dateEnv.formatRange(instance.range.start, instance.range.end, formatter, {
                    forcedStartTzo: instance.forcedStartTzo,
                    forcedEndTzo: instance.forcedEndTzo
                });
            }
            else {
                return dateEnv.format(instance.range.start, formatter, {
                    forcedTzo: instance.forcedStartTzo
                });
            }
        };
        EventApi.prototype.mutate = function (mutation) {
            var def = this._def;
            var instance = this._instance;
            if (instance) {
                this._calendar.dispatch({
                    type: 'MUTATE_EVENTS',
                    instanceId: instance.instanceId,
                    mutation: mutation,
                    fromApi: true
                });
                var eventStore = this._calendar.state.eventStore;
                this._def = eventStore.defs[def.defId];
                this._instance = eventStore.instances[instance.instanceId];
            }
        };
        EventApi.prototype.remove = function () {
            this._calendar.dispatch({
                type: 'REMOVE_EVENT_DEF',
                defId: this._def.defId
            });
        };
        Object.defineProperty(EventApi.prototype, "source", {
            get: function () {
                var sourceId = this._def.sourceId;
                if (sourceId) {
                    return new EventSourceApi(this._calendar, this._calendar.state.eventSources[sourceId]);
                }
                return null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "start", {
            get: function () {
                return this._instance ?
                    this._calendar.dateEnv.toDate(this._instance.range.start) :
                    null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "end", {
            get: function () {
                return (this._instance && this._def.hasEnd) ?
                    this._calendar.dateEnv.toDate(this._instance.range.end) :
                    null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "id", {
            // computable props that all access the def
            // TODO: find a TypeScript-compatible way to do this at scale
            get: function () { return this._def.publicId; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "groupId", {
            get: function () { return this._def.groupId; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "allDay", {
            get: function () { return this._def.allDay; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "title", {
            get: function () { return this._def.title; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "url", {
            get: function () { return this._def.url; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "display", {
            get: function () { return this._def.ui.display || 'auto'; } // bad. just normalize the type earlier
            ,
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "startEditable", {
            get: function () { return this._def.ui.startEditable; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "durationEditable", {
            get: function () { return this._def.ui.durationEditable; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "constraint", {
            get: function () { return this._def.ui.constraints[0] || null; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "overlap", {
            get: function () { return this._def.ui.overlap; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "allow", {
            get: function () { return this._def.ui.allows[0] || null; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "backgroundColor", {
            get: function () { return this._def.ui.backgroundColor; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "borderColor", {
            get: function () { return this._def.ui.borderColor; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "textColor", {
            get: function () { return this._def.ui.textColor; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "classNames", {
            // NOTE: user can't modify these because Object.freeze was called in event-def parsing
            get: function () { return this._def.ui.classNames; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(EventApi.prototype, "extendedProps", {
            get: function () { return this._def.extendedProps; },
            enumerable: true,
            configurable: true
        });
        return EventApi;
    }());

    /*
    Specifying nextDayThreshold signals that all-day ranges should be sliced.
    */
    function sliceEventStore(eventStore, eventUiBases, framingRange, nextDayThreshold) {
        var inverseBgByGroupId = {};
        var inverseBgByDefId = {};
        var defByGroupId = {};
        var bgRanges = [];
        var fgRanges = [];
        var eventUis = compileEventUis(eventStore.defs, eventUiBases);
        for (var defId in eventStore.defs) {
            var def = eventStore.defs[defId];
            var ui = eventUis[def.defId];
            if (ui.display === 'inverse-background') {
                if (def.groupId) {
                    inverseBgByGroupId[def.groupId] = [];
                    if (!defByGroupId[def.groupId]) {
                        defByGroupId[def.groupId] = def;
                    }
                }
                else {
                    inverseBgByDefId[defId] = [];
                }
            }
        }
        for (var instanceId in eventStore.instances) {
            var instance = eventStore.instances[instanceId];
            var def = eventStore.defs[instance.defId];
            var ui = eventUis[def.defId];
            var origRange = instance.range;
            var normalRange = (!def.allDay && nextDayThreshold) ?
                computeVisibleDayRange(origRange, nextDayThreshold) :
                origRange;
            var slicedRange = intersectRanges(normalRange, framingRange);
            if (slicedRange) {
                if (ui.display === 'inverse-background') {
                    if (def.groupId) {
                        inverseBgByGroupId[def.groupId].push(slicedRange);
                    }
                    else {
                        inverseBgByDefId[instance.defId].push(slicedRange);
                    }
                }
                else if (ui.display !== 'none') {
                    (ui.display === 'background' ? bgRanges : fgRanges).push({
                        def: def,
                        ui: ui,
                        instance: instance,
                        range: slicedRange,
                        isStart: normalRange.start && normalRange.start.valueOf() === slicedRange.start.valueOf(),
                        isEnd: normalRange.end && normalRange.end.valueOf() === slicedRange.end.valueOf()
                    });
                }
            }
        }
        for (var groupId in inverseBgByGroupId) { // BY GROUP
            var ranges = inverseBgByGroupId[groupId];
            var invertedRanges = invertRanges(ranges, framingRange);
            for (var _i = 0, invertedRanges_1 = invertedRanges; _i < invertedRanges_1.length; _i++) {
                var invertedRange = invertedRanges_1[_i];
                var def = defByGroupId[groupId];
                var ui = eventUis[def.defId];
                bgRanges.push({
                    def: def,
                    ui: ui,
                    instance: null,
                    range: invertedRange,
                    isStart: false,
                    isEnd: false
                });
            }
        }
        for (var defId in inverseBgByDefId) {
            var ranges = inverseBgByDefId[defId];
            var invertedRanges = invertRanges(ranges, framingRange);
            for (var _a = 0, invertedRanges_2 = invertedRanges; _a < invertedRanges_2.length; _a++) {
                var invertedRange = invertedRanges_2[_a];
                bgRanges.push({
                    def: eventStore.defs[defId],
                    ui: eventUis[defId],
                    instance: null,
                    range: invertedRange,
                    isStart: false,
                    isEnd: false
                });
            }
        }
        return { bg: bgRanges, fg: fgRanges };
    }
    function hasBgRendering(def) {
        return def.ui.display === 'background' || def.ui.display === 'inverse-background';
    }
    function setElSeg(el, seg) {
        el.fcSeg = seg;
    }
    function getElSeg(el) {
        return el.fcSeg ||
            el.parentNode.fcSeg || // for the harness
            null;
    }
    // event ui computation
    function compileEventUis(eventDefs, eventUiBases) {
        return mapHash(eventDefs, function (eventDef) {
            return compileEventUi(eventDef, eventUiBases);
        });
    }
    function compileEventUi(eventDef, eventUiBases) {
        var uis = [];
        if (eventUiBases['']) {
            uis.push(eventUiBases['']);
        }
        if (eventUiBases[eventDef.defId]) {
            uis.push(eventUiBases[eventDef.defId]);
        }
        uis.push(eventDef.ui);
        return combineEventUis(uis);
    }
    function sortEventSegs(segs, eventOrderSpecs) {
        var objs = segs.map(buildSegCompareObj);
        objs.sort(function (obj0, obj1) {
            return compareByFieldSpecs(obj0, obj1, eventOrderSpecs);
        });
        return objs.map(function (c) {
            return c._seg;
        });
    }
    // returns a object with all primitive props that can be compared
    function buildSegCompareObj(seg) {
        var eventRange = seg.eventRange;
        var eventDef = eventRange.def;
        var range = eventRange.instance ? eventRange.instance.range : eventRange.range;
        var start = range.start ? range.start.valueOf() : 0; // TODO: better support for open-range events
        var end = range.end ? range.end.valueOf() : 0; // "
        return __assign(__assign(__assign({}, eventDef.extendedProps), eventDef), { id: eventDef.publicId, start: start,
            end: end, duration: end - start, allDay: Number(eventDef.allDay), _seg: seg // for later retrieval
         });
    }
    function computeSegDraggable(seg, context) {
        var pluginHooks = context.pluginHooks, calendar = context.calendar;
        var transformers = pluginHooks.isDraggableTransformers;
        var _a = seg.eventRange, def = _a.def, ui = _a.ui;
        var val = ui.startEditable;
        for (var _i = 0, transformers_1 = transformers; _i < transformers_1.length; _i++) {
            var transformer = transformers_1[_i];
            val = transformer(val, def, ui, calendar);
        }
        return val;
    }
    function computeSegStartResizable(seg, context) {
        return seg.isStart && seg.eventRange.ui.durationEditable && context.options.eventResizableFromStart;
    }
    function computeSegEndResizable(seg, context) {
        return seg.isEnd && seg.eventRange.ui.durationEditable;
    }
    function buildSegTimeText(seg, timeFormat, context, defaultDisplayEventTime, // defaults to true
    defaultDisplayEventEnd, // defaults to true
    startOverride, endOverride) {
        var dateEnv = context.dateEnv, options = context.options;
        var displayEventTime = options.displayEventTime, displayEventEnd = options.displayEventEnd;
        var eventDef = seg.eventRange.def;
        var eventInstance = seg.eventRange.instance;
        if (displayEventTime == null) {
            displayEventTime = defaultDisplayEventTime !== false;
        }
        if (displayEventEnd == null) {
            displayEventEnd = defaultDisplayEventEnd !== false;
        }
        if (displayEventTime && !eventDef.allDay && (seg.isStart || seg.isEnd)) {
            var segStart = startOverride || (seg.isStart ? eventInstance.range.start : (seg.start || seg.eventRange.range.start));
            var segEnd = endOverride || (seg.isEnd ? eventInstance.range.end : (seg.end || seg.eventRange.range.end));
            if (displayEventEnd && eventDef.hasEnd) {
                return dateEnv.formatRange(segStart, segEnd, timeFormat, {
                    forcedStartTzo: startOverride ? null : eventInstance.forcedStartTzo,
                    forcedEndTzo: endOverride ? null : eventInstance.forcedEndTzo
                });
            }
            else {
                return dateEnv.format(segStart, timeFormat, {
                    forcedTzo: startOverride ? null : eventInstance.forcedStartTzo // nooooo, same
                });
            }
        }
        return '';
    }
    function getSegMeta(seg, todayRange, nowDate) {
        var segRange = seg.eventRange.range;
        return {
            isPast: segRange.end < (nowDate || todayRange.start),
            isFuture: segRange.start >= (nowDate || todayRange.end),
            isToday: todayRange && rangeContainsMarker(todayRange, segRange.start)
        };
    }
    function getEventClassNames(props) {
        var classNames = ['fc-event'];
        if (props.isMirror) {
            classNames.push('fc-event-mirror');
        }
        if (props.isDraggable) {
            classNames.push('fc-event-draggable');
        }
        if (props.isStartResizable || props.isEndResizable) {
            classNames.push('fc-event-resizable');
        }
        if (props.isDragging) {
            classNames.push('fc-event-dragging');
        }
        if (props.isResizing) {
            classNames.push('fc-event-resizing');
        }
        if (props.isSelected) {
            classNames.push('fc-event-selected');
        }
        if (props.isStart) {
            classNames.push('fc-event-start');
        }
        if (props.isEnd) {
            classNames.push('fc-event-end');
        }
        if (props.isPast) {
            classNames.push('fc-event-past');
        }
        if (props.isToday) {
            classNames.push('fc-event-today');
        }
        if (props.isFuture) {
            classNames.push('fc-event-future');
        }
        return classNames;
    }
    function getSkinCss(ui) {
        return {
            'background-color': ui.backgroundColor,
            'border-color': ui.borderColor,
            color: ui.textColor
        };
    }

    // applies the mutation to ALL defs/instances within the event store
    function applyMutationToEventStore(eventStore, eventConfigBase, mutation, calendar) {
        var eventConfigs = compileEventUis(eventStore.defs, eventConfigBase);
        var dest = createEmptyEventStore();
        for (var defId in eventStore.defs) {
            var def = eventStore.defs[defId];
            dest.defs[defId] = applyMutationToEventDef(def, eventConfigs[defId], mutation, calendar.pluginSystem.hooks.eventDefMutationAppliers, calendar);
        }
        for (var instanceId in eventStore.instances) {
            var instance = eventStore.instances[instanceId];
            var def = dest.defs[instance.defId]; // important to grab the newly modified def
            dest.instances[instanceId] = applyMutationToEventInstance(instance, def, eventConfigs[instance.defId], mutation, calendar);
        }
        return dest;
    }
    function applyMutationToEventDef(eventDef, eventConfig, mutation, appliers, calendar) {
        var standardProps = mutation.standardProps || {};
        // if hasEnd has not been specified, guess a good value based on deltas.
        // if duration will change, there's no way the default duration will persist,
        // and thus, we need to mark the event as having a real end
        if (standardProps.hasEnd == null &&
            eventConfig.durationEditable &&
            (mutation.startDelta || mutation.endDelta)) {
            standardProps.hasEnd = true; // TODO: is this mutation okay?
        }
        var copy = __assign(__assign(__assign({}, eventDef), standardProps), { ui: __assign(__assign({}, eventDef.ui), standardProps.ui) });
        if (mutation.extendedProps) {
            copy.extendedProps = __assign(__assign({}, copy.extendedProps), mutation.extendedProps);
        }
        for (var _i = 0, appliers_1 = appliers; _i < appliers_1.length; _i++) {
            var applier = appliers_1[_i];
            applier(copy, mutation, calendar);
        }
        if (!copy.hasEnd && calendar.opt('forceEventDuration')) {
            copy.hasEnd = true;
        }
        return copy;
    }
    function applyMutationToEventInstance(eventInstance, eventDef, // must first be modified by applyMutationToEventDef
    eventConfig, mutation, calendar) {
        var dateEnv = calendar.dateEnv;
        var forceAllDay = mutation.standardProps && mutation.standardProps.allDay === true;
        var clearEnd = mutation.standardProps && mutation.standardProps.hasEnd === false;
        var copy = __assign({}, eventInstance);
        if (forceAllDay) {
            copy.range = computeAlignedDayRange(copy.range);
        }
        if (mutation.datesDelta && eventConfig.startEditable) {
            copy.range = {
                start: dateEnv.add(copy.range.start, mutation.datesDelta),
                end: dateEnv.add(copy.range.end, mutation.datesDelta)
            };
        }
        if (mutation.startDelta && eventConfig.durationEditable) {
            copy.range = {
                start: dateEnv.add(copy.range.start, mutation.startDelta),
                end: copy.range.end
            };
        }
        if (mutation.endDelta && eventConfig.durationEditable) {
            copy.range = {
                start: copy.range.start,
                end: dateEnv.add(copy.range.end, mutation.endDelta)
            };
        }
        if (clearEnd) {
            copy.range = {
                start: copy.range.start,
                end: calendar.getDefaultEventEnd(eventDef.allDay, copy.range.start)
            };
        }
        // in case event was all-day but the supplied deltas were not
        // better util for this?
        if (eventDef.allDay) {
            copy.range = {
                start: startOfDay(copy.range.start),
                end: startOfDay(copy.range.end)
            };
        }
        // handle invalid durations
        if (copy.range.end < copy.range.start) {
            copy.range.end = calendar.getDefaultEventEnd(eventDef.allDay, copy.range.start);
        }
        return copy;
    }

    function reduceEventStore (eventStore, action, eventSources, dateProfile, calendar) {
        switch (action.type) {
            case 'RECEIVE_EVENTS': // raw
                return receiveRawEvents(eventStore, eventSources[action.sourceId], action.fetchId, action.fetchRange, action.rawEvents, calendar);
            case 'ADD_EVENTS': // already parsed, but not expanded
                return addEvent(eventStore, action.eventStore, // new ones
                dateProfile ? dateProfile.activeRange : null, calendar);
            case 'MERGE_EVENTS': // already parsed and expanded
                return mergeEventStores(eventStore, action.eventStore);
            case 'PREV': // TODO: how do we track all actions that affect dateProfile :(
            case 'NEXT':
            case 'SET_DATE':
            case 'SET_VIEW_TYPE':
                if (dateProfile) {
                    return expandRecurring(eventStore, dateProfile.activeRange, calendar);
                }
                else {
                    return eventStore;
                }
            case 'CHANGE_TIMEZONE':
                return rezoneDates(eventStore, action.oldDateEnv, calendar.dateEnv);
            case 'MUTATE_EVENTS':
                return applyMutationToRelated(eventStore, action.instanceId, action.mutation, action.fromApi, calendar);
            case 'REMOVE_EVENT_INSTANCES':
                return excludeInstances(eventStore, action.instances);
            case 'REMOVE_EVENT_DEF':
                return filterEventStoreDefs(eventStore, function (eventDef) {
                    return eventDef.defId !== action.defId;
                });
            case 'REMOVE_EVENT_SOURCE':
                return excludeEventsBySourceId(eventStore, action.sourceId);
            case 'REMOVE_ALL_EVENT_SOURCES':
                return filterEventStoreDefs(eventStore, function (eventDef) {
                    return !eventDef.sourceId; // only keep events with no source id
                });
            case 'REMOVE_ALL_EVENTS':
                return createEmptyEventStore();
            default:
                return eventStore;
        }
    }
    function receiveRawEvents(eventStore, eventSource, fetchId, fetchRange, rawEvents, calendar) {
        if (eventSource && // not already removed
            fetchId === eventSource.latestFetchId // TODO: wish this logic was always in event-sources
        ) {
            var subset = parseEvents(transformRawEvents(rawEvents, eventSource, calendar), eventSource.sourceId, calendar);
            if (fetchRange) {
                subset = expandRecurring(subset, fetchRange, calendar);
            }
            return mergeEventStores(excludeEventsBySourceId(eventStore, eventSource.sourceId), subset);
        }
        return eventStore;
    }
    function addEvent(eventStore, subset, expandRange, calendar) {
        if (expandRange) {
            subset = expandRecurring(subset, expandRange, calendar);
        }
        return mergeEventStores(eventStore, subset);
    }
    function rezoneDates(eventStore, oldDateEnv, newDateEnv) {
        var defs = eventStore.defs;
        var instances = mapHash(eventStore.instances, function (instance) {
            var def = defs[instance.defId];
            if (def.allDay || def.recurringDef) {
                return instance; // isn't dependent on timezone
            }
            else {
                return __assign(__assign({}, instance), { range: {
                        start: newDateEnv.createMarker(oldDateEnv.toDate(instance.range.start, instance.forcedStartTzo)),
                        end: newDateEnv.createMarker(oldDateEnv.toDate(instance.range.end, instance.forcedEndTzo))
                    }, forcedStartTzo: newDateEnv.canComputeOffset ? null : instance.forcedStartTzo, forcedEndTzo: newDateEnv.canComputeOffset ? null : instance.forcedEndTzo });
            }
        });
        return { defs: defs, instances: instances };
    }
    function applyMutationToRelated(eventStore, instanceId, mutation, fromApi, calendar) {
        var relevant = getRelevantEvents(eventStore, instanceId);
        var eventConfigBase = fromApi ?
            { '': {
                    display: '',
                    startEditable: true,
                    durationEditable: true,
                    constraints: [],
                    overlap: null,
                    allows: [],
                    backgroundColor: '',
                    borderColor: '',
                    textColor: '',
                    classNames: []
                } } :
            calendar.eventUiBases;
        relevant = applyMutationToEventStore(relevant, eventConfigBase, mutation, calendar);
        return mergeEventStores(eventStore, relevant);
    }
    function excludeEventsBySourceId(eventStore, sourceId) {
        return filterEventStoreDefs(eventStore, function (eventDef) {
            return eventDef.sourceId !== sourceId;
        });
    }
    // QUESTION: why not just return instances? do a general object-property-exclusion util
    function excludeInstances(eventStore, removals) {
        return {
            defs: eventStore.defs,
            instances: filterHash(eventStore.instances, function (instance) {
                return !removals[instance.instanceId];
            })
        };
    }

    // high-level segmenting-aware tester functions
    // ------------------------------------------------------------------------------------------------------------------------
    function isInteractionValid(interaction, calendar) {
        return isNewPropsValid({ eventDrag: interaction }, calendar); // HACK: the eventDrag props is used for ALL interactions
    }
    function isDateSelectionValid(dateSelection, calendar) {
        return isNewPropsValid({ dateSelection: dateSelection }, calendar);
    }
    function isNewPropsValid(newProps, calendar) {
        var view = calendar.component.view;
        var props = __assign({ businessHours: view ? view.props.businessHours : createEmptyEventStore(), dateSelection: '', eventStore: calendar.state.eventStore, eventUiBases: calendar.eventUiBases, eventSelection: '', eventDrag: null, eventResize: null }, newProps);
        return (calendar.pluginSystem.hooks.isPropsValid || isPropsValid)(props, calendar);
    }
    function isPropsValid(state, calendar, dateSpanMeta, filterConfig) {
        if (dateSpanMeta === void 0) { dateSpanMeta = {}; }
        if (state.eventDrag && !isInteractionPropsValid(state, calendar, dateSpanMeta, filterConfig)) {
            return false;
        }
        if (state.dateSelection && !isDateSelectionPropsValid(state, calendar, dateSpanMeta, filterConfig)) {
            return false;
        }
        return true;
    }
    // Moving Event Validation
    // ------------------------------------------------------------------------------------------------------------------------
    function isInteractionPropsValid(state, calendar, dateSpanMeta, filterConfig) {
        var interaction = state.eventDrag; // HACK: the eventDrag props is used for ALL interactions
        var subjectEventStore = interaction.mutatedEvents;
        var subjectDefs = subjectEventStore.defs;
        var subjectInstances = subjectEventStore.instances;
        var subjectConfigs = compileEventUis(subjectDefs, interaction.isEvent ?
            state.eventUiBases :
            { '': calendar.selectionConfig } // if not a real event, validate as a selection
        );
        if (filterConfig) {
            subjectConfigs = mapHash(subjectConfigs, filterConfig);
        }
        var otherEventStore = excludeInstances(state.eventStore, interaction.affectedEvents.instances); // exclude the subject events. TODO: exclude defs too?
        var otherDefs = otherEventStore.defs;
        var otherInstances = otherEventStore.instances;
        var otherConfigs = compileEventUis(otherDefs, state.eventUiBases);
        for (var subjectInstanceId in subjectInstances) {
            var subjectInstance = subjectInstances[subjectInstanceId];
            var subjectRange = subjectInstance.range;
            var subjectConfig = subjectConfigs[subjectInstance.defId];
            var subjectDef = subjectDefs[subjectInstance.defId];
            // constraint
            if (!allConstraintsPass(subjectConfig.constraints, subjectRange, otherEventStore, state.businessHours, calendar)) {
                return false;
            }
            // overlap
            var overlapFunc = calendar.opt('eventOverlap');
            if (typeof overlapFunc !== 'function') {
                overlapFunc = null;
            }
            for (var otherInstanceId in otherInstances) {
                var otherInstance = otherInstances[otherInstanceId];
                // intersect! evaluate
                if (rangesIntersect(subjectRange, otherInstance.range)) {
                    var otherOverlap = otherConfigs[otherInstance.defId].overlap;
                    // consider the other event's overlap. only do this if the subject event is a "real" event
                    if (otherOverlap === false && interaction.isEvent) {
                        return false;
                    }
                    if (subjectConfig.overlap === false) {
                        return false;
                    }
                    if (overlapFunc && !overlapFunc(new EventApi(calendar, otherDefs[otherInstance.defId], otherInstance), // still event
                    new EventApi(calendar, subjectDef, subjectInstance) // moving event
                    )) {
                        return false;
                    }
                }
            }
            // allow (a function)
            var calendarEventStore = calendar.state.eventStore; // need global-to-calendar, not local to component (splittable)state
            for (var _i = 0, _a = subjectConfig.allows; _i < _a.length; _i++) {
                var subjectAllow = _a[_i];
                var subjectDateSpan = __assign(__assign({}, dateSpanMeta), { range: subjectInstance.range, allDay: subjectDef.allDay });
                var origDef = calendarEventStore.defs[subjectDef.defId];
                var origInstance = calendarEventStore.instances[subjectInstanceId];
                var eventApi = void 0;
                if (origDef) { // was previously in the calendar
                    eventApi = new EventApi(calendar, origDef, origInstance);
                }
                else { // was an external event
                    eventApi = new EventApi(calendar, subjectDef); // no instance, because had no dates
                }
                if (!subjectAllow(calendar.buildDateSpanApi(subjectDateSpan), eventApi)) {
                    return false;
                }
            }
        }
        return true;
    }
    // Date Selection Validation
    // ------------------------------------------------------------------------------------------------------------------------
    function isDateSelectionPropsValid(state, calendar, dateSpanMeta, filterConfig) {
        var relevantEventStore = state.eventStore;
        var relevantDefs = relevantEventStore.defs;
        var relevantInstances = relevantEventStore.instances;
        var selection = state.dateSelection;
        var selectionRange = selection.range;
        var selectionConfig = calendar.selectionConfig;
        if (filterConfig) {
            selectionConfig = filterConfig(selectionConfig);
        }
        // constraint
        if (!allConstraintsPass(selectionConfig.constraints, selectionRange, relevantEventStore, state.businessHours, calendar)) {
            return false;
        }
        // overlap
        var overlapFunc = calendar.opt('selectOverlap');
        if (typeof overlapFunc !== 'function') {
            overlapFunc = null;
        }
        for (var relevantInstanceId in relevantInstances) {
            var relevantInstance = relevantInstances[relevantInstanceId];
            // intersect! evaluate
            if (rangesIntersect(selectionRange, relevantInstance.range)) {
                if (selectionConfig.overlap === false) {
                    return false;
                }
                if (overlapFunc && !overlapFunc(new EventApi(calendar, relevantDefs[relevantInstance.defId], relevantInstance))) {
                    return false;
                }
            }
        }
        // allow (a function)
        for (var _i = 0, _a = selectionConfig.allows; _i < _a.length; _i++) {
            var selectionAllow = _a[_i];
            var fullDateSpan = __assign(__assign({}, dateSpanMeta), selection);
            if (!selectionAllow(calendar.buildDateSpanApi(fullDateSpan), null)) {
                return false;
            }
        }
        return true;
    }
    // Constraint Utils
    // ------------------------------------------------------------------------------------------------------------------------
    function allConstraintsPass(constraints, subjectRange, otherEventStore, businessHoursUnexpanded, calendar) {
        for (var _i = 0, constraints_1 = constraints; _i < constraints_1.length; _i++) {
            var constraint = constraints_1[_i];
            if (!anyRangesContainRange(constraintToRanges(constraint, subjectRange, otherEventStore, businessHoursUnexpanded, calendar), subjectRange)) {
                return false;
            }
        }
        return true;
    }
    function constraintToRanges(constraint, subjectRange, // for expanding a recurring constraint, or expanding business hours
    otherEventStore, // for if constraint is an even group ID
    businessHoursUnexpanded, // for if constraint is 'businessHours'
    calendar // for expanding businesshours
    ) {
        if (constraint === 'businessHours') {
            return eventStoreToRanges(expandRecurring(businessHoursUnexpanded, subjectRange, calendar));
        }
        else if (typeof constraint === 'string') { // an group ID
            return eventStoreToRanges(filterEventStoreDefs(otherEventStore, function (eventDef) {
                return eventDef.groupId === constraint;
            }));
        }
        else if (typeof constraint === 'object' && constraint) { // non-null object
            return eventStoreToRanges(expandRecurring(constraint, subjectRange, calendar));
        }
        return []; // if it's false
    }
    // TODO: move to event-store file?
    function eventStoreToRanges(eventStore) {
        var instances = eventStore.instances;
        var ranges = [];
        for (var instanceId in instances) {
            ranges.push(instances[instanceId].range);
        }
        return ranges;
    }
    // TODO: move to geom file?
    function anyRangesContainRange(outerRanges, innerRange) {
        for (var _i = 0, outerRanges_1 = outerRanges; _i < outerRanges_1.length; _i++) {
            var outerRange = outerRanges_1[_i];
            if (rangeContainsRange(outerRange, innerRange)) {
                return true;
            }
        }
        return false;
    }
    // Parsing
    // ------------------------------------------------------------------------------------------------------------------------
    function normalizeConstraint(input, calendar) {
        if (Array.isArray(input)) {
            return parseEvents(input, '', calendar, true); // allowOpenRange=true
        }
        else if (typeof input === 'object' && input) { // non-null object
            return parseEvents([input], '', calendar, true); // allowOpenRange=true
        }
        else if (input != null) {
            return String(input);
        }
        else {
            return null;
        }
    }

    function parseClassName(raw) {
        if (Array.isArray(raw)) {
            return raw;
        }
        else if (typeof raw === 'string') {
            return raw.split(/\s+/);
        }
        else {
            return [];
        }
    }

    var UNSCOPED_EVENT_UI_PROPS = {
        display: null,
        editable: Boolean,
        startEditable: Boolean,
        durationEditable: Boolean,
        constraint: null,
        overlap: null,
        allow: null,
        className: parseClassName,
        classNames: parseClassName,
        color: String,
        backgroundColor: String,
        borderColor: String,
        textColor: String
    };
    function processUnscopedUiProps(rawProps, calendar, leftovers) {
        var props = refineProps(rawProps, UNSCOPED_EVENT_UI_PROPS, {}, leftovers);
        var constraint = normalizeConstraint(props.constraint, calendar);
        return {
            display: props.display,
            startEditable: props.startEditable != null ? props.startEditable : props.editable,
            durationEditable: props.durationEditable != null ? props.durationEditable : props.editable,
            constraints: constraint != null ? [constraint] : [],
            overlap: props.overlap,
            allows: props.allow != null ? [props.allow] : [],
            backgroundColor: props.backgroundColor || props.color,
            borderColor: props.borderColor || props.color,
            textColor: props.textColor,
            classNames: props.classNames.concat(props.className)
        };
    }
    function processScopedUiProps(prefix, rawScoped, calendar, leftovers) {
        var rawUnscoped = {};
        var wasFound = {};
        for (var key in UNSCOPED_EVENT_UI_PROPS) {
            var scopedKey = prefix + capitaliseFirstLetter(key);
            rawUnscoped[key] = rawScoped[scopedKey];
            wasFound[scopedKey] = true;
        }
        if (prefix === 'event') {
            rawUnscoped.editable = rawScoped.editable; // special case. there is no 'eventEditable', just 'editable'
        }
        if (leftovers) {
            for (var key in rawScoped) {
                if (!wasFound[key]) {
                    leftovers[key] = rawScoped[key];
                }
            }
        }
        return processUnscopedUiProps(rawUnscoped, calendar);
    }
    var EMPTY_EVENT_UI = {
        display: null,
        startEditable: null,
        durationEditable: null,
        constraints: [],
        overlap: null,
        allows: [],
        backgroundColor: '',
        borderColor: '',
        textColor: '',
        classNames: []
    };
    // prevent against problems with <2 args!
    function combineEventUis(uis) {
        return uis.reduce(combineTwoEventUis, EMPTY_EVENT_UI);
    }
    function combineTwoEventUis(item0, item1) {
        return {
            display: item1.display != null ? item1.display : item0.display,
            startEditable: item1.startEditable != null ? item1.startEditable : item0.startEditable,
            durationEditable: item1.durationEditable != null ? item1.durationEditable : item0.durationEditable,
            constraints: item0.constraints.concat(item1.constraints),
            overlap: typeof item1.overlap === 'boolean' ? item1.overlap : item0.overlap,
            allows: item0.allows.concat(item1.allows),
            backgroundColor: item1.backgroundColor || item0.backgroundColor,
            borderColor: item1.borderColor || item0.borderColor,
            textColor: item1.textColor || item0.textColor,
            classNames: item0.classNames.concat(item1.classNames)
        };
    }

    var NON_DATE_PROPS = {
        id: String,
        groupId: String,
        title: String,
        url: String,
        extendedProps: null
    };
    var DATE_PROPS = {
        start: null,
        date: null,
        end: null,
        allDay: null
    };
    function parseEvent(raw, sourceId, calendar, allowOpenRange) {
        var defaultAllDay = computeIsdefaultAllDay(sourceId, calendar);
        var leftovers0 = {};
        var recurringRes = parseRecurring(raw, // raw, but with single-event stuff stripped out
        defaultAllDay, calendar.dateEnv, calendar.pluginSystem.hooks.recurringTypes, leftovers0 // will populate with non-recurring props
        );
        if (recurringRes) {
            var def = parseEventDef(leftovers0, sourceId, recurringRes.allDay, Boolean(recurringRes.duration), calendar);
            def.recurringDef = {
                typeId: recurringRes.typeId,
                typeData: recurringRes.typeData,
                duration: recurringRes.duration
            };
            return { def: def, instance: null };
        }
        else {
            var leftovers1 = {};
            var singleRes = parseSingle(raw, defaultAllDay, calendar, leftovers1, allowOpenRange);
            if (singleRes) {
                var def = parseEventDef(leftovers1, sourceId, singleRes.allDay, singleRes.hasEnd, calendar);
                var instance = createEventInstance(def.defId, singleRes.range, singleRes.forcedStartTzo, singleRes.forcedEndTzo);
                return { def: def, instance: instance };
            }
        }
        return null;
    }
    /*
    Will NOT populate extendedProps with the leftover properties.
    Will NOT populate date-related props.
    The EventNonDateInput has been normalized (id => publicId, etc).
    */
    function parseEventDef(raw, sourceId, allDay, hasEnd, calendar) {
        var leftovers = {};
        var def = pluckNonDateProps(raw, calendar, leftovers);
        def.defId = guid();
        def.sourceId = sourceId;
        def.allDay = allDay;
        def.hasEnd = hasEnd;
        for (var _i = 0, _a = calendar.pluginSystem.hooks.eventDefParsers; _i < _a.length; _i++) {
            var eventDefParser = _a[_i];
            var newLeftovers = {};
            eventDefParser(def, leftovers, newLeftovers);
            leftovers = newLeftovers;
        }
        def.extendedProps = __assign(leftovers, def.extendedProps || {});
        // help out EventApi from having user modify props
        Object.freeze(def.ui.classNames);
        Object.freeze(def.extendedProps);
        return def;
    }
    function createEventInstance(defId, range, forcedStartTzo, forcedEndTzo) {
        return {
            instanceId: guid(),
            defId: defId,
            range: range,
            forcedStartTzo: forcedStartTzo == null ? null : forcedStartTzo,
            forcedEndTzo: forcedEndTzo == null ? null : forcedEndTzo
        };
    }
    function parseSingle(raw, defaultAllDay, calendar, leftovers, allowOpenRange) {
        var props = pluckDateProps(raw, leftovers);
        var allDay = props.allDay;
        var startMeta;
        var startMarker = null;
        var hasEnd = false;
        var endMeta;
        var endMarker = null;
        startMeta = calendar.dateEnv.createMarkerMeta(props.start);
        if (startMeta) {
            startMarker = startMeta.marker;
        }
        else if (!allowOpenRange) {
            return null;
        }
        if (props.end != null) {
            endMeta = calendar.dateEnv.createMarkerMeta(props.end);
        }
        if (allDay == null) {
            if (defaultAllDay != null) {
                allDay = defaultAllDay;
            }
            else {
                // fall back to the date props LAST
                allDay = (!startMeta || startMeta.isTimeUnspecified) &&
                    (!endMeta || endMeta.isTimeUnspecified);
            }
        }
        if (allDay && startMarker) {
            startMarker = startOfDay(startMarker);
        }
        if (endMeta) {
            endMarker = endMeta.marker;
            if (allDay) {
                endMarker = startOfDay(endMarker);
            }
            if (startMarker && endMarker <= startMarker) {
                endMarker = null;
            }
        }
        if (endMarker) {
            hasEnd = true;
        }
        else if (!allowOpenRange) {
            hasEnd = calendar.opt('forceEventDuration') || false;
            endMarker = calendar.dateEnv.add(startMarker, allDay ?
                calendar.defaultAllDayEventDuration :
                calendar.defaultTimedEventDuration);
        }
        return {
            allDay: allDay,
            hasEnd: hasEnd,
            range: { start: startMarker, end: endMarker },
            forcedStartTzo: startMeta ? startMeta.forcedTzo : null,
            forcedEndTzo: endMeta ? endMeta.forcedTzo : null
        };
    }
    function pluckDateProps(raw, leftovers) {
        var props = refineProps(raw, DATE_PROPS, {}, leftovers);
        props.start = (props.start !== null) ? props.start : props.date;
        delete props.date;
        return props;
    }
    function pluckNonDateProps(raw, calendar, leftovers) {
        var preLeftovers = {};
        var props = refineProps(raw, NON_DATE_PROPS, {}, preLeftovers);
        var ui = processUnscopedUiProps(preLeftovers, calendar, leftovers);
        props.publicId = props.id;
        delete props.id;
        props.ui = ui;
        return props;
    }
    function computeIsdefaultAllDay(sourceId, calendar) {
        var res = null;
        if (sourceId) {
            var source = calendar.state.eventSources[sourceId];
            res = source.defaultAllDay;
        }
        if (res == null) {
            res = calendar.opt('defaultAllDay');
        }
        return res;
    }

    var DEF_DEFAULTS = {
        startTime: '09:00',
        endTime: '17:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        display: 'inverse-background',
        classNames: 'fc-non-business',
        groupId: '_businessHours' // so multiple defs get grouped
    };
    /*
    TODO: pass around as EventDefHash!!!
    */
    function parseBusinessHours(input, calendar) {
        return parseEvents(refineInputs(input), '', calendar);
    }
    function refineInputs(input) {
        var rawDefs;
        if (input === true) {
            rawDefs = [{}]; // will get DEF_DEFAULTS verbatim
        }
        else if (Array.isArray(input)) {
            // if specifying an array, every sub-definition NEEDS a day-of-week
            rawDefs = input.filter(function (rawDef) {
                return rawDef.daysOfWeek;
            });
        }
        else if (typeof input === 'object' && input) { // non-null object
            rawDefs = [input];
        }
        else { // is probably false
            rawDefs = [];
        }
        rawDefs = rawDefs.map(function (rawDef) {
            return __assign(__assign({}, DEF_DEFAULTS), rawDef);
        });
        return rawDefs;
    }

    function pointInsideRect(point, rect) {
        return point.left >= rect.left &&
            point.left < rect.right &&
            point.top >= rect.top &&
            point.top < rect.bottom;
    }
    // Returns a new rectangle that is the intersection of the two rectangles. If they don't intersect, returns false
    function intersectRects(rect1, rect2) {
        var res = {
            left: Math.max(rect1.left, rect2.left),
            right: Math.min(rect1.right, rect2.right),
            top: Math.max(rect1.top, rect2.top),
            bottom: Math.min(rect1.bottom, rect2.bottom)
        };
        if (res.left < res.right && res.top < res.bottom) {
            return res;
        }
        return false;
    }
    // Returns a new point that will have been moved to reside within the given rectangle
    function constrainPoint(point, rect) {
        return {
            left: Math.min(Math.max(point.left, rect.left), rect.right),
            top: Math.min(Math.max(point.top, rect.top), rect.bottom)
        };
    }
    // Returns a point that is the center of the given rectangle
    function getRectCenter(rect) {
        return {
            left: (rect.left + rect.right) / 2,
            top: (rect.top + rect.bottom) / 2
        };
    }
    // Subtracts point2's coordinates from point1's coordinates, returning a delta
    function diffPoints(point1, point2) {
        return {
            left: point1.left - point2.left,
            top: point1.top - point2.top
        };
    }

    var EMPTY_EVENT_STORE = createEmptyEventStore(); // for purecomponents. TODO: keep elsewhere
    var Splitter = /** @class */ (function () {
        function Splitter() {
            this.getKeysForEventDefs = memoize(this._getKeysForEventDefs);
            this.splitDateSelection = memoize(this._splitDateSpan);
            this.splitEventStore = memoize(this._splitEventStore);
            this.splitIndividualUi = memoize(this._splitIndividualUi);
            this.splitEventDrag = memoize(this._splitInteraction);
            this.splitEventResize = memoize(this._splitInteraction);
            this.eventUiBuilders = {}; // TODO: typescript protection
        }
        Splitter.prototype.splitProps = function (props) {
            var _this = this;
            var keyInfos = this.getKeyInfo(props);
            var defKeys = this.getKeysForEventDefs(props.eventStore);
            var dateSelections = this.splitDateSelection(props.dateSelection);
            var individualUi = this.splitIndividualUi(props.eventUiBases, defKeys); // the individual *bases*
            var eventStores = this.splitEventStore(props.eventStore, defKeys);
            var eventDrags = this.splitEventDrag(props.eventDrag);
            var eventResizes = this.splitEventResize(props.eventResize);
            var splitProps = {};
            this.eventUiBuilders = mapHash(keyInfos, function (info, key) {
                return _this.eventUiBuilders[key] || memoize(buildEventUiForKey);
            });
            for (var key in keyInfos) {
                var keyInfo = keyInfos[key];
                var eventStore = eventStores[key] || EMPTY_EVENT_STORE;
                var buildEventUi = this.eventUiBuilders[key];
                splitProps[key] = {
                    businessHours: keyInfo.businessHours || props.businessHours,
                    dateSelection: dateSelections[key] || null,
                    eventStore: eventStore,
                    eventUiBases: buildEventUi(props.eventUiBases[''], keyInfo.ui, individualUi[key]),
                    eventSelection: eventStore.instances[props.eventSelection] ? props.eventSelection : '',
                    eventDrag: eventDrags[key] || null,
                    eventResize: eventResizes[key] || null
                };
            }
            return splitProps;
        };
        Splitter.prototype._splitDateSpan = function (dateSpan) {
            var dateSpans = {};
            if (dateSpan) {
                var keys = this.getKeysForDateSpan(dateSpan);
                for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
                    var key = keys_1[_i];
                    dateSpans[key] = dateSpan;
                }
            }
            return dateSpans;
        };
        Splitter.prototype._getKeysForEventDefs = function (eventStore) {
            var _this = this;
            return mapHash(eventStore.defs, function (eventDef) {
                return _this.getKeysForEventDef(eventDef);
            });
        };
        Splitter.prototype._splitEventStore = function (eventStore, defKeys) {
            var defs = eventStore.defs, instances = eventStore.instances;
            var splitStores = {};
            for (var defId in defs) {
                for (var _i = 0, _a = defKeys[defId]; _i < _a.length; _i++) {
                    var key = _a[_i];
                    if (!splitStores[key]) {
                        splitStores[key] = createEmptyEventStore();
                    }
                    splitStores[key].defs[defId] = defs[defId];
                }
            }
            for (var instanceId in instances) {
                var instance = instances[instanceId];
                for (var _b = 0, _c = defKeys[instance.defId]; _b < _c.length; _b++) {
                    var key = _c[_b];
                    if (splitStores[key]) { // must have already been created
                        splitStores[key].instances[instanceId] = instance;
                    }
                }
            }
            return splitStores;
        };
        Splitter.prototype._splitIndividualUi = function (eventUiBases, defKeys) {
            var splitHashes = {};
            for (var defId in eventUiBases) {
                if (defId) { // not the '' key
                    for (var _i = 0, _a = defKeys[defId]; _i < _a.length; _i++) {
                        var key = _a[_i];
                        if (!splitHashes[key]) {
                            splitHashes[key] = {};
                        }
                        splitHashes[key][defId] = eventUiBases[defId];
                    }
                }
            }
            return splitHashes;
        };
        Splitter.prototype._splitInteraction = function (interaction) {
            var splitStates = {};
            if (interaction) {
                var affectedStores_1 = this._splitEventStore(interaction.affectedEvents, this._getKeysForEventDefs(interaction.affectedEvents) // can't use cached. might be events from other calendar
                );
                // can't rely on defKeys because event data is mutated
                var mutatedKeysByDefId = this._getKeysForEventDefs(interaction.mutatedEvents);
                var mutatedStores_1 = this._splitEventStore(interaction.mutatedEvents, mutatedKeysByDefId);
                var populate = function (key) {
                    if (!splitStates[key]) {
                        splitStates[key] = {
                            affectedEvents: affectedStores_1[key] || EMPTY_EVENT_STORE,
                            mutatedEvents: mutatedStores_1[key] || EMPTY_EVENT_STORE,
                            isEvent: interaction.isEvent
                        };
                    }
                };
                for (var key in affectedStores_1) {
                    populate(key);
                }
                for (var key in mutatedStores_1) {
                    populate(key);
                }
            }
            return splitStates;
        };
        return Splitter;
    }());
    function buildEventUiForKey(allUi, eventUiForKey, individualUi) {
        var baseParts = [];
        if (allUi) {
            baseParts.push(allUi);
        }
        if (eventUiForKey) {
            baseParts.push(eventUiForKey);
        }
        var stuff = {
            '': combineEventUis(baseParts)
        };
        if (individualUi) {
            __assign(stuff, individualUi);
        }
        return stuff;
    }

    function getDateMeta(date, todayRange, nowDate, dateProfile) {
        return {
            dow: date.getUTCDay(),
            isDisabled: Boolean(dateProfile && !rangeContainsMarker(dateProfile.activeRange, date)),
            isOther: Boolean(dateProfile && !rangeContainsMarker(dateProfile.currentRange, date)),
            isToday: Boolean(todayRange && rangeContainsMarker(todayRange, date)),
            isPast: Boolean(nowDate ? (date < nowDate) : todayRange ? (date < todayRange.start) : false),
            isFuture: Boolean(nowDate ? (date > nowDate) : todayRange ? (date >= todayRange.end) : false)
        };
    }
    function getDayClassNames(meta, theme) {
        var classNames = [
            'fc-day',
            'fc-day-' + DAY_IDS[meta.dow]
        ];
        if (meta.isDisabled) {
            classNames.push('fc-day-disabled');
        }
        else {
            if (meta.isToday) {
                classNames.push('fc-day-today');
                classNames.push(theme.getClass('today'));
            }
            if (meta.isPast) {
                classNames.push('fc-day-past');
            }
            if (meta.isFuture) {
                classNames.push('fc-day-future');
            }
            if (meta.isOther) {
                classNames.push('fc-day-other');
            }
        }
        return classNames;
    }

    function buildNavLinkData(date, type) {
        if (type === void 0) { type = 'day'; }
        return JSON.stringify({
            date: formatDayString(date),
            type: type
        });
    }

    var _isRtlScrollbarOnLeft = null;
    function getIsRtlScrollbarOnLeft() {
        if (_isRtlScrollbarOnLeft === null) {
            _isRtlScrollbarOnLeft = computeIsRtlScrollbarOnLeft();
        }
        return _isRtlScrollbarOnLeft;
    }
    function computeIsRtlScrollbarOnLeft() {
        // TODO: use htmlToElement
        var outerEl = document.createElement('div');
        applyStyle(outerEl, {
            position: 'absolute',
            top: -1000,
            left: 0,
            border: 0,
            padding: 0,
            overflow: 'scroll',
            direction: 'rtl'
        });
        outerEl.innerHTML = '<div></div>';
        document.body.appendChild(outerEl);
        var innerEl = outerEl.firstChild;
        var res = innerEl.getBoundingClientRect().left > outerEl.getBoundingClientRect().left;
        removeElement(outerEl);
        return res;
    }

    var _scrollbarWidths;
    function getScrollbarWidths() {
        if (!_scrollbarWidths) {
            _scrollbarWidths = computeScrollbarWidths();
        }
        return _scrollbarWidths;
    }
    function computeScrollbarWidths() {
        var el = document.createElement('div');
        el.style.overflow = 'scroll';
        document.body.appendChild(el);
        var res = computeScrollbarWidthsForEl(el);
        document.body.removeChild(el);
        return res;
    }
    // WARNING: will include border
    function computeScrollbarWidthsForEl(el) {
        return {
            x: el.offsetHeight - el.clientHeight,
            y: el.offsetWidth - el.clientWidth
        };
    }

    function computeEdges(el, getPadding) {
        if (getPadding === void 0) { getPadding = false; }
        var computedStyle = window.getComputedStyle(el);
        var borderLeft = parseInt(computedStyle.borderLeftWidth, 10) || 0;
        var borderRight = parseInt(computedStyle.borderRightWidth, 10) || 0;
        var borderTop = parseInt(computedStyle.borderTopWidth, 10) || 0;
        var borderBottom = parseInt(computedStyle.borderBottomWidth, 10) || 0;
        var badScrollbarWidths = computeScrollbarWidthsForEl(el); // includes border!
        var scrollbarLeftRight = badScrollbarWidths.y - borderLeft - borderRight;
        var scrollbarBottom = badScrollbarWidths.x - borderTop - borderBottom;
        var res = {
            borderLeft: borderLeft,
            borderRight: borderRight,
            borderTop: borderTop,
            borderBottom: borderBottom,
            scrollbarBottom: scrollbarBottom,
            scrollbarLeft: 0,
            scrollbarRight: 0
        };
        if (getIsRtlScrollbarOnLeft() && computedStyle.direction === 'rtl') { // is the scrollbar on the left side?
            res.scrollbarLeft = scrollbarLeftRight;
        }
        else {
            res.scrollbarRight = scrollbarLeftRight;
        }
        if (getPadding) {
            res.paddingLeft = parseInt(computedStyle.paddingLeft, 10) || 0;
            res.paddingRight = parseInt(computedStyle.paddingRight, 10) || 0;
            res.paddingTop = parseInt(computedStyle.paddingTop, 10) || 0;
            res.paddingBottom = parseInt(computedStyle.paddingBottom, 10) || 0;
        }
        return res;
    }
    function computeInnerRect(el, goWithinPadding, doFromWindowViewport) {
        if (goWithinPadding === void 0) { goWithinPadding = false; }
        var outerRect = doFromWindowViewport ? el.getBoundingClientRect() : computeRect(el);
        var edges = computeEdges(el, goWithinPadding);
        var res = {
            left: outerRect.left + edges.borderLeft + edges.scrollbarLeft,
            right: outerRect.right - edges.borderRight - edges.scrollbarRight,
            top: outerRect.top + edges.borderTop,
            bottom: outerRect.bottom - edges.borderBottom - edges.scrollbarBottom
        };
        if (goWithinPadding) {
            res.left += edges.paddingLeft;
            res.right -= edges.paddingRight;
            res.top += edges.paddingTop;
            res.bottom -= edges.paddingBottom;
        }
        return res;
    }
    function computeRect(el) {
        var rect = el.getBoundingClientRect();
        return {
            left: rect.left + window.pageXOffset,
            top: rect.top + window.pageYOffset,
            right: rect.right + window.pageXOffset,
            bottom: rect.bottom + window.pageYOffset
        };
    }
    // does not return window
    function getClippingParents(el) {
        var parents = [];
        while (el instanceof HTMLElement) { // will stop when gets to document or null
            var computedStyle = window.getComputedStyle(el);
            if (computedStyle.position === 'fixed') {
                break;
            }
            if ((/(auto|scroll)/).test(computedStyle.overflow + computedStyle.overflowY + computedStyle.overflowX)) {
                parents.push(el);
            }
            el = el.parentNode;
        }
        return parents;
    }

    // given a function that resolves a result asynchronously.
    // the function can either call passed-in success and failure callbacks,
    // or it can return a promise.
    // if you need to pass additional params to func, bind them first.
    function unpromisify(func, success, failure) {
        // guard against success/failure callbacks being called more than once
        // and guard against a promise AND callback being used together.
        var isResolved = false;
        var wrappedSuccess = function () {
            if (!isResolved) {
                isResolved = true;
                success.apply(this, arguments);
            }
        };
        var wrappedFailure = function () {
            if (!isResolved) {
                isResolved = true;
                if (failure) {
                    failure.apply(this, arguments);
                }
            }
        };
        var res = func(wrappedSuccess, wrappedFailure);
        if (res && typeof res.then === 'function') {
            res.then(wrappedSuccess, wrappedFailure);
        }
    }

    var Mixin = /** @class */ (function () {
        function Mixin() {
        }
        // mix into a CLASS
        Mixin.mixInto = function (destClass) {
            this.mixIntoObj(destClass.prototype);
        };
        // mix into ANY object
        Mixin.mixIntoObj = function (destObj) {
            var _this = this;
            Object.getOwnPropertyNames(this.prototype).forEach(function (name) {
                if (!destObj[name]) { // if destination doesn't already define it
                    destObj[name] = _this.prototype[name];
                }
            });
        };
        /*
        will override existing methods
        TODO: remove! not used anymore
        */
        Mixin.mixOver = function (destClass) {
            var _this = this;
            Object.getOwnPropertyNames(this.prototype).forEach(function (name) {
                destClass.prototype[name] = _this.prototype[name];
            });
        };
        return Mixin;
    }());

    /*
    USAGE:
      import { default as EmitterMixin, EmitterInterface } from './EmitterMixin'
    in class:
      on: EmitterInterface['on']
      one: EmitterInterface['one']
      off: EmitterInterface['off']
      trigger: EmitterInterface['trigger']
      triggerWith: EmitterInterface['triggerWith']
      hasHandlers: EmitterInterface['hasHandlers']
    after class:
      EmitterMixin.mixInto(TheClass)
    */
    var EmitterMixin = /** @class */ (function (_super) {
        __extends(EmitterMixin, _super);
        function EmitterMixin() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        EmitterMixin.prototype.on = function (type, handler) {
            addToHash(this._handlers || (this._handlers = {}), type, handler);
            return this; // for chaining
        };
        // todo: add comments
        EmitterMixin.prototype.one = function (type, handler) {
            addToHash(this._oneHandlers || (this._oneHandlers = {}), type, handler);
            return this; // for chaining
        };
        EmitterMixin.prototype.off = function (type, handler) {
            if (this._handlers) {
                removeFromHash(this._handlers, type, handler);
            }
            if (this._oneHandlers) {
                removeFromHash(this._oneHandlers, type, handler);
            }
            return this; // for chaining
        };
        EmitterMixin.prototype.trigger = function (type) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            this.triggerWith(type, this, args);
            return this; // for chaining
        };
        EmitterMixin.prototype.triggerWith = function (type, context, args) {
            if (this._handlers) {
                applyAll(this._handlers[type], context, args);
            }
            if (this._oneHandlers) {
                applyAll(this._oneHandlers[type], context, args);
                delete this._oneHandlers[type]; // will never fire again
            }
            return this; // for chaining
        };
        EmitterMixin.prototype.hasHandlers = function (type) {
            return (this._handlers && this._handlers[type] && this._handlers[type].length) ||
                (this._oneHandlers && this._oneHandlers[type] && this._oneHandlers[type].length);
        };
        return EmitterMixin;
    }(Mixin));
    function addToHash(hash, type, handler) {
        (hash[type] || (hash[type] = []))
            .push(handler);
    }
    function removeFromHash(hash, type, handler) {
        if (handler) {
            if (hash[type]) {
                hash[type] = hash[type].filter(function (func) {
                    return func !== handler;
                });
            }
        }
        else {
            delete hash[type]; // remove all handler funcs for this type
        }
    }

    /*
    Records offset information for a set of elements, relative to an origin element.
    Can record the left/right OR the top/bottom OR both.
    Provides methods for querying the cache by position.
    */
    var PositionCache = /** @class */ (function () {
        function PositionCache(originEl, els, isHorizontal, isVertical) {
            this.els = els;
            var originClientRect = this.originClientRect = originEl.getBoundingClientRect(); // relative to viewport top-left
            if (isHorizontal) {
                this.buildElHorizontals(originClientRect.left);
            }
            if (isVertical) {
                this.buildElVerticals(originClientRect.top);
            }
        }
        // Populates the left/right internal coordinate arrays
        PositionCache.prototype.buildElHorizontals = function (originClientLeft) {
            var lefts = [];
            var rights = [];
            for (var _i = 0, _a = this.els; _i < _a.length; _i++) {
                var el = _a[_i];
                var rect = el.getBoundingClientRect();
                lefts.push(rect.left - originClientLeft);
                rights.push(rect.right - originClientLeft);
            }
            this.lefts = lefts;
            this.rights = rights;
        };
        // Populates the top/bottom internal coordinate arrays
        PositionCache.prototype.buildElVerticals = function (originClientTop) {
            var tops = [];
            var bottoms = [];
            for (var _i = 0, _a = this.els; _i < _a.length; _i++) {
                var el = _a[_i];
                var rect = el.getBoundingClientRect();
                tops.push(rect.top - originClientTop);
                bottoms.push(rect.bottom - originClientTop);
            }
            this.tops = tops;
            this.bottoms = bottoms;
        };
        // Given a left offset (from document left), returns the index of the el that it horizontally intersects.
        // If no intersection is made, returns undefined.
        PositionCache.prototype.leftToIndex = function (leftPosition) {
            var lefts = this.lefts;
            var rights = this.rights;
            var len = lefts.length;
            var i;
            for (i = 0; i < len; i++) {
                if (leftPosition >= lefts[i] && leftPosition < rights[i]) {
                    return i;
                }
            }
        };
        // Given a top offset (from document top), returns the index of the el that it vertically intersects.
        // If no intersection is made, returns undefined.
        PositionCache.prototype.topToIndex = function (topPosition) {
            var tops = this.tops;
            var bottoms = this.bottoms;
            var len = tops.length;
            var i;
            for (i = 0; i < len; i++) {
                if (topPosition >= tops[i] && topPosition < bottoms[i]) {
                    return i;
                }
            }
        };
        // Gets the width of the element at the given index
        PositionCache.prototype.getWidth = function (leftIndex) {
            return this.rights[leftIndex] - this.lefts[leftIndex];
        };
        // Gets the height of the element at the given index
        PositionCache.prototype.getHeight = function (topIndex) {
            return this.bottoms[topIndex] - this.tops[topIndex];
        };
        return PositionCache;
    }());

    /*
    An object for getting/setting scroll-related information for an element.
    Internally, this is done very differently for window versus DOM element,
    so this object serves as a common interface.
    */
    var ScrollController = /** @class */ (function () {
        function ScrollController() {
        }
        ScrollController.prototype.getMaxScrollTop = function () {
            return this.getScrollHeight() - this.getClientHeight();
        };
        ScrollController.prototype.getMaxScrollLeft = function () {
            return this.getScrollWidth() - this.getClientWidth();
        };
        ScrollController.prototype.canScrollVertically = function () {
            return this.getMaxScrollTop() > 0;
        };
        ScrollController.prototype.canScrollHorizontally = function () {
            return this.getMaxScrollLeft() > 0;
        };
        ScrollController.prototype.canScrollUp = function () {
            return this.getScrollTop() > 0;
        };
        ScrollController.prototype.canScrollDown = function () {
            return this.getScrollTop() < this.getMaxScrollTop();
        };
        ScrollController.prototype.canScrollLeft = function () {
            return this.getScrollLeft() > 0;
        };
        ScrollController.prototype.canScrollRight = function () {
            return this.getScrollLeft() < this.getMaxScrollLeft();
        };
        return ScrollController;
    }());
    var ElementScrollController = /** @class */ (function (_super) {
        __extends(ElementScrollController, _super);
        function ElementScrollController(el) {
            var _this = _super.call(this) || this;
            _this.el = el;
            return _this;
        }
        ElementScrollController.prototype.getScrollTop = function () {
            return this.el.scrollTop;
        };
        ElementScrollController.prototype.getScrollLeft = function () {
            return this.el.scrollLeft;
        };
        ElementScrollController.prototype.setScrollTop = function (top) {
            this.el.scrollTop = top;
        };
        ElementScrollController.prototype.setScrollLeft = function (left) {
            this.el.scrollLeft = left;
        };
        ElementScrollController.prototype.getScrollWidth = function () {
            return this.el.scrollWidth;
        };
        ElementScrollController.prototype.getScrollHeight = function () {
            return this.el.scrollHeight;
        };
        ElementScrollController.prototype.getClientHeight = function () {
            return this.el.clientHeight;
        };
        ElementScrollController.prototype.getClientWidth = function () {
            return this.el.clientWidth;
        };
        return ElementScrollController;
    }(ScrollController));
    var WindowScrollController = /** @class */ (function (_super) {
        __extends(WindowScrollController, _super);
        function WindowScrollController() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        WindowScrollController.prototype.getScrollTop = function () {
            return window.pageYOffset;
        };
        WindowScrollController.prototype.getScrollLeft = function () {
            return window.pageXOffset;
        };
        WindowScrollController.prototype.setScrollTop = function (n) {
            window.scroll(window.pageXOffset, n);
        };
        WindowScrollController.prototype.setScrollLeft = function (n) {
            window.scroll(n, window.pageYOffset);
        };
        WindowScrollController.prototype.getScrollWidth = function () {
            return document.documentElement.scrollWidth;
        };
        WindowScrollController.prototype.getScrollHeight = function () {
            return document.documentElement.scrollHeight;
        };
        WindowScrollController.prototype.getClientHeight = function () {
            return document.documentElement.clientHeight;
        };
        WindowScrollController.prototype.getClientWidth = function () {
            return document.documentElement.clientWidth;
        };
        return WindowScrollController;
    }(ScrollController));

    var Theme = /** @class */ (function () {
        function Theme(calendarOptions) {
            if (this.iconOverrideOption) {
                this.setIconOverride(calendarOptions[this.iconOverrideOption]);
            }
        }
        Theme.prototype.setIconOverride = function (iconOverrideHash) {
            var iconClassesCopy;
            var buttonName;
            if (typeof iconOverrideHash === 'object' && iconOverrideHash) { // non-null object
                iconClassesCopy = __assign({}, this.iconClasses);
                for (buttonName in iconOverrideHash) {
                    iconClassesCopy[buttonName] = this.applyIconOverridePrefix(iconOverrideHash[buttonName]);
                }
                this.iconClasses = iconClassesCopy;
            }
            else if (iconOverrideHash === false) {
                this.iconClasses = {};
            }
        };
        Theme.prototype.applyIconOverridePrefix = function (className) {
            var prefix = this.iconOverridePrefix;
            if (prefix && className.indexOf(prefix) !== 0) { // if not already present
                className = prefix + className;
            }
            return className;
        };
        Theme.prototype.getClass = function (key) {
            return this.classes[key] || '';
        };
        Theme.prototype.getIconClass = function (buttonName, isRtl) {
            var className;
            if (isRtl && this.rtlIconClasses) {
                className = this.rtlIconClasses[buttonName] || this.iconClasses[buttonName];
            }
            else {
                className = this.iconClasses[buttonName];
            }
            if (className) {
                return this.baseIconClass + ' ' + className;
            }
            return '';
        };
        Theme.prototype.getCustomButtonIconClass = function (customButtonProps) {
            var className;
            if (this.iconOverrideCustomButtonOption) {
                className = customButtonProps[this.iconOverrideCustomButtonOption];
                if (className) {
                    return this.baseIconClass + ' ' + this.applyIconOverridePrefix(className);
                }
            }
            return '';
        };
        return Theme;
    }());
    Theme.prototype.classes = {};
    Theme.prototype.iconClasses = {};
    Theme.prototype.baseIconClass = '';
    Theme.prototype.iconOverridePrefix = '';

    function flushToDom() {
        var oldDebounceRendering = n.debounceRendering;
        var callbackQ = [];
        function execCallbackSync(callback) {
            callbackQ.push(callback);
        }
        n.debounceRendering = execCallbackSync;
        H(h(FakeComponent, {}), document.createElement('div'));
        while (callbackQ.length) {
            callbackQ.shift()();
        }
        n.debounceRendering = oldDebounceRendering;
    }
    var FakeComponent = /** @class */ (function (_super) {
        __extends(FakeComponent, _super);
        function FakeComponent() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        FakeComponent.prototype.render = function () { return h('div', {}); };
        FakeComponent.prototype.componentDidMount = function () { this.setState({}); };
        return FakeComponent;
    }(m));

    // TODO: make separate parsing of headerToolbar/footerToolbar part of options-processing system
    function parseToolbars(allOptions, theme, isRtl, calendar) {
        var viewsWithButtons = [];
        var headerToolbar = allOptions.headerToolbar ? parseToolbar(allOptions.headerToolbar, theme, isRtl, calendar, viewsWithButtons) : null;
        var footerToolbar = allOptions.footerToolbar ? parseToolbar(allOptions.footerToolbar, theme, isRtl, calendar, viewsWithButtons) : null;
        return { headerToolbar: headerToolbar, footerToolbar: footerToolbar, viewsWithButtons: viewsWithButtons };
    }
    function parseToolbar(raw, theme, isRtl, calendar, viewsWithButtons) {
        return mapHash(raw, function (rawSection) { return parseSection(rawSection, theme, isRtl, calendar, viewsWithButtons); });
    }
    /*
    BAD: querying icons and text here. should be done at render time
    */
    function parseSection(sectionStr, theme, isRtl, calendar, viewsWithButtons) {
        var optionsManager = calendar.optionsManager;
        var viewSpecs = calendar.viewSpecs;
        var calendarCustomButtons = optionsManager.computed.customButtons || {};
        var calendarButtonTextOverrides = optionsManager.overrides.buttonText || {};
        var calendarButtonText = optionsManager.computed.buttonText || {};
        var sectionSubstrs = sectionStr ? sectionStr.split(' ') : [];
        return sectionSubstrs.map(function (buttonGroupStr, i) {
            return buttonGroupStr.split(',').map(function (buttonName, j) {
                if (buttonName === 'title') {
                    return { buttonName: buttonName };
                }
                else {
                    var customButtonProps_1;
                    var viewSpec = void 0;
                    var buttonClick = void 0;
                    var buttonIcon = void 0; // only one of these will be set
                    var buttonText = void 0; // "
                    if ((customButtonProps_1 = calendarCustomButtons[buttonName])) {
                        buttonClick = function (ev) {
                            if (customButtonProps_1.click) {
                                customButtonProps_1.click.call(ev.target, ev); // TODO: correct to use `target`?
                            }
                        };
                        (buttonIcon = theme.getCustomButtonIconClass(customButtonProps_1)) ||
                            (buttonIcon = theme.getIconClass(buttonName, isRtl)) ||
                            (buttonText = customButtonProps_1.text);
                    }
                    else if ((viewSpec = viewSpecs[buttonName])) {
                        viewsWithButtons.push(buttonName);
                        buttonClick = function () {
                            calendar.changeView(buttonName);
                        };
                        (buttonText = viewSpec.buttonTextOverride) ||
                            (buttonIcon = theme.getIconClass(buttonName, isRtl)) ||
                            (buttonText = viewSpec.buttonTextDefault);
                    }
                    else if (calendar[buttonName]) { // a calendar method
                        buttonClick = function () {
                            calendar[buttonName]();
                        };
                        (buttonText = calendarButtonTextOverrides[buttonName]) ||
                            (buttonIcon = theme.getIconClass(buttonName, isRtl)) ||
                            (buttonText = calendarButtonText[buttonName]);
                        //            ^ everything else is considered default
                    }
                    return { buttonName: buttonName, buttonClick: buttonClick, buttonIcon: buttonIcon, buttonText: buttonText };
                }
            });
        });
    }

    var ScrollResponder = /** @class */ (function () {
        function ScrollResponder(calendar, execFunc) {
            var _this = this;
            this.calendar = calendar;
            this.execFunc = execFunc;
            this.handleScrollRequest = function (request) {
                _this.queuedRequest = __assign({}, _this.queuedRequest || {}, request);
                _this.drain();
            };
            calendar.on('scrollRequest', this.handleScrollRequest);
            this.fireInitialScroll();
        }
        ScrollResponder.prototype.detach = function () {
            this.calendar.off('scrollRequest', this.handleScrollRequest);
        };
        ScrollResponder.prototype.update = function (isDatesNew) {
            if (isDatesNew) {
                this.fireInitialScroll(); // will drain
            }
            else {
                this.drain();
            }
        };
        ScrollResponder.prototype.fireInitialScroll = function () {
            this.handleScrollRequest({
                time: createDuration(this.calendar.viewOpt('scrollTime'))
            });
        };
        ScrollResponder.prototype.drain = function () {
            if (this.queuedRequest && this.execFunc(this.queuedRequest)) {
                this.queuedRequest = null;
            }
        };
        return ScrollResponder;
    }());

    var ComponentContextType = M({}); // for Components
    function buildContext(calendar, pluginHooks, dateEnv, theme, view, options) {
        return __assign(__assign({ calendar: calendar,
            pluginHooks: pluginHooks,
            dateEnv: dateEnv,
            theme: theme,
            view: view,
            options: options }, computeContextProps(options, theme, calendar)), { addResizeHandler: calendar.addResizeHandler, removeResizeHandler: calendar.removeResizeHandler, createScrollResponder: function (execFunc) {
                return new ScrollResponder(calendar, execFunc);
            } });
    }
    function computeContextProps(options, theme, calendar) {
        var isRtl = options.direction === 'rtl';
        return __assign({ isRtl: isRtl, eventOrderSpecs: parseFieldSpecs(options.eventOrder), nextDayThreshold: createDuration(options.nextDayThreshold) }, parseToolbars(options, theme, isRtl, calendar));
    }

    // TODO: make a HOC instead
    var BaseComponent = /** @class */ (function (_super) {
        __extends(BaseComponent, _super);
        function BaseComponent() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        BaseComponent.prototype.shouldComponentUpdate = function (nextProps, nextState, nextContext) {
            if (this.debug) {
                console.log(getUnequalProps(nextProps, this.props), getUnequalProps(nextState, this.state));
            }
            return !compareObjs(this.props, nextProps, this.propEquality) ||
                !compareObjs(this.state, nextState, this.stateEquality) ||
                this.context !== nextContext;
        };
        BaseComponent.addPropsEquality = addPropsEquality;
        BaseComponent.addStateEquality = addStateEquality;
        BaseComponent.contextType = ComponentContextType;
        return BaseComponent;
    }(m));
    BaseComponent.prototype.propEquality = {};
    BaseComponent.prototype.stateEquality = {};
    function addPropsEquality(propEquality) {
        var hash = Object.create(this.prototype.propEquality);
        __assign(hash, propEquality);
        this.prototype.propEquality = hash;
    }
    function addStateEquality(stateEquality) {
        var hash = Object.create(this.prototype.stateEquality);
        __assign(hash, stateEquality);
        this.prototype.stateEquality = hash;
    }
    // use other one
    function setRef(ref, current) {
        if (typeof ref === 'function') {
            ref(current);
        }
        else if (ref) {
            ref.current = current;
        }
    }

    /*
    an INTERACTABLE date component

    PURPOSES:
    - hook up to fg, fill, and mirror renderers
    - interface for dragging and hits
    */
    var DateComponent = /** @class */ (function (_super) {
        __extends(DateComponent, _super);
        function DateComponent() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.uid = guid();
            return _this;
        }
        // Hit System
        // -----------------------------------------------------------------------------------------------------------------
        DateComponent.prototype.prepareHits = function () {
        };
        DateComponent.prototype.queryHit = function (positionLeft, positionTop, elWidth, elHeight) {
            return null; // this should be abstract
        };
        // Validation
        // -----------------------------------------------------------------------------------------------------------------
        DateComponent.prototype.isInteractionValid = function (interaction) {
            var calendar = this.context.calendar;
            var dateProfile = this.props.dateProfile; // HACK
            var instances = interaction.mutatedEvents.instances;
            if (dateProfile) { // HACK for MorePopover
                for (var instanceId in instances) {
                    if (!rangeContainsRange(dateProfile.validRange, instances[instanceId].range)) {
                        return false;
                    }
                }
            }
            return isInteractionValid(interaction, calendar);
        };
        DateComponent.prototype.isDateSelectionValid = function (selection) {
            var calendar = this.context.calendar;
            var dateProfile = this.props.dateProfile; // HACK
            if (dateProfile && // HACK for MorePopover
                !rangeContainsRange(dateProfile.validRange, selection.range)) {
                return false;
            }
            return isDateSelectionValid(selection, calendar);
        };
        // Pointer Interaction Utils
        // -----------------------------------------------------------------------------------------------------------------
        DateComponent.prototype.isValidSegDownEl = function (el) {
            return !this.props.eventDrag && // HACK
                !this.props.eventResize && // HACK
                !elementClosest(el, '.fc-event-mirror') &&
                (this.isPopover() || !this.isInPopover(el));
            // ^above line ensures we don't detect a seg interaction within a nested component.
            // it's a HACK because it only supports a popover as the nested component.
        };
        DateComponent.prototype.isValidDateDownEl = function (el) {
            return !elementClosest(el, '.fc-event:not(.fc-bg-event)') &&
                !elementClosest(el, '.fc-daygrid-more-link') && // a "more.." link
                !elementClosest(el, 'a[data-navlink]') && // a clickable nav link
                !this.isInPopover(el);
        };
        DateComponent.prototype.isPopover = function () {
            return false;
        };
        DateComponent.prototype.isInPopover = function (el) {
            return Boolean(elementClosest(el, '.fc-popover'));
        };
        return DateComponent;
    }(BaseComponent));

    var config = {}; // TODO: make these options
    var globalDefaults = {
        defaultRangeSeparator: ' - ',
        titleRangeSeparator: ' \u2013 ',
        defaultTimedEventDuration: '01:00:00',
        defaultAllDayEventDuration: { day: 1 },
        forceEventDuration: false,
        nextDayThreshold: '00:00:00',
        // display
        dayHeaders: true,
        initialView: '',
        aspectRatio: 1.35,
        headerToolbar: {
            start: 'title',
            center: '',
            end: 'today prev,next'
        },
        weekends: true,
        weekNumbers: false,
        weekNumberCalculation: 'local',
        editable: false,
        // nowIndicator: false,
        scrollTime: '06:00:00',
        slotMinTime: '00:00:00',
        slotMaxTime: '24:00:00',
        showNonCurrentDates: true,
        // event ajax
        lazyFetching: true,
        startParam: 'start',
        endParam: 'end',
        timeZoneParam: 'timeZone',
        timeZone: 'local',
        // defaultAllDay: undefined,
        // locale
        locales: [],
        locale: '',
        // direction: will get this from the default locale
        // buttonIcons: null,
        themeSystem: 'standard',
        // eventResizableFromStart: false,
        dragRevertDuration: 500,
        dragScroll: true,
        allDayMaintainDuration: false,
        // selectable: false,
        unselectAuto: true,
        // selectMinDistance: 0,
        dropAccept: '*',
        eventOrder: 'start,-duration,allDay,title',
        // ^ if start tie, longer events go before shorter. final tie-breaker is title text
        // rerenderDelay: null,
        moreLinkClick: 'popover',
        dayPopoverFormat: { month: 'long', day: 'numeric', year: 'numeric' },
        handleWindowResize: true,
        windowResizeDelay: 100,
        longPressDelay: 1000,
        eventDragMinDistance: 5,
        expandRows: false
        // dayMinWidth: null
    };
    var complexOptions = [
        'headerToolbar',
        'footerToolbar',
        'buttonText',
        'buttonIcons'
    ];
    // Merges an array of option objects into a single object
    function mergeOptions(optionObjs) {
        return mergeProps(optionObjs, complexOptions);
    }

    function getGlobalRawLocales() {
        // NOTE: make sure this global variable name is in-sync with the rollup bundle locale script
        var globalStore = window['FullCalendarLocales'];
        return Array.isArray(globalStore) ? globalStore : // assigned by locales-all
            hashValuesToArray(globalStore); // assigned by individual locale file(s)
    }

    var RAW_EN_LOCALE = {
        code: 'en',
        week: {
            dow: 0,
            doy: 4 // 4 days need to be within the year to be considered the first week
        },
        direction: 'ltr',
        buttonText: {
            prev: 'prev',
            next: 'next',
            prevYear: 'prev year',
            nextYear: 'next year',
            year: 'year',
            today: 'today',
            month: 'month',
            week: 'week',
            day: 'day',
            list: 'list'
        },
        weekText: 'W',
        allDayText: 'all-day',
        moreLinkText: 'more',
        noEventsText: 'No events to display'
    };
    function organizeRawLocales(explicitRawLocales) {
        var defaultCode = explicitRawLocales.length > 0 ? explicitRawLocales[0].code : 'en';
        var globalRawLocales = getGlobalRawLocales();
        var allRawLocales = globalRawLocales.concat(explicitRawLocales);
        var rawLocaleMap = {
            en: RAW_EN_LOCALE // necessary?
        };
        for (var _i = 0, allRawLocales_1 = allRawLocales; _i < allRawLocales_1.length; _i++) {
            var rawLocale = allRawLocales_1[_i];
            rawLocaleMap[rawLocale.code] = rawLocale;
        }
        return {
            map: rawLocaleMap,
            defaultCode: defaultCode
        };
    }
    function buildLocale(inputSingular, available) {
        if (typeof inputSingular === 'object' && !Array.isArray(inputSingular)) {
            return parseLocale(inputSingular.code, [inputSingular.code], inputSingular);
        }
        else {
            return queryLocale(inputSingular, available);
        }
    }
    function queryLocale(codeArg, available) {
        var codes = [].concat(codeArg || []); // will convert to array
        var raw = queryRawLocale(codes, available) || RAW_EN_LOCALE;
        return parseLocale(codeArg, codes, raw);
    }
    function queryRawLocale(codes, available) {
        for (var i = 0; i < codes.length; i++) {
            var parts = codes[i].toLocaleLowerCase().split('-');
            for (var j = parts.length; j > 0; j--) {
                var simpleId = parts.slice(0, j).join('-');
                if (available[simpleId]) {
                    return available[simpleId];
                }
            }
        }
        return null;
    }
    function parseLocale(codeArg, codes, raw) {
        var merged = mergeProps([RAW_EN_LOCALE, raw], ['buttonText']);
        delete merged.code; // don't want this part of the options
        var week = merged.week;
        delete merged.week;
        return {
            codeArg: codeArg,
            codes: codes,
            week: week,
            simpleNumberFormat: new Intl.NumberFormat(codeArg),
            options: merged
        };
    }

    var OptionsManager = /** @class */ (function () {
        function OptionsManager(overrides) {
            this.overrides = __assign({}, overrides); // make a copy
            this.dynamicOverrides = {};
            this.compute();
        }
        OptionsManager.prototype.mutate = function (updates, removals, isDynamic) {
            if (!Object.keys(updates).length && !removals.length) {
                return;
            }
            var overrideHash = isDynamic ? this.dynamicOverrides : this.overrides;
            __assign(overrideHash, updates);
            for (var _i = 0, removals_1 = removals; _i < removals_1.length; _i++) {
                var propName = removals_1[_i];
                delete overrideHash[propName];
            }
            this.compute();
        };
        // Computes the flattened options hash for the calendar and assigns to `this.options`.
        // Assumes this.overrides and this.dynamicOverrides have already been initialized.
        OptionsManager.prototype.compute = function () {
            // TODO: not a very efficient system
            var locales = firstDefined(// explicit locale option given?
            this.dynamicOverrides.locales, this.overrides.locales, globalDefaults.locales);
            var locale = firstDefined(// explicit locales option given?
            this.dynamicOverrides.locale, this.overrides.locale, globalDefaults.locale);
            var available = organizeRawLocales(locales); // also done in Calendar :(
            var localeDefaults = buildLocale(locale || available.defaultCode, available.map).options;
            this.localeDefaults = localeDefaults;
            this.computed = mergeOptions([
                globalDefaults,
                localeDefaults,
                this.overrides,
                this.dynamicOverrides
            ]);
        };
        return OptionsManager;
    }());

    var calendarSystemClassMap = {};
    function registerCalendarSystem(name, theClass) {
        calendarSystemClassMap[name] = theClass;
    }
    function createCalendarSystem(name) {
        return new calendarSystemClassMap[name]();
    }
    var GregorianCalendarSystem = /** @class */ (function () {
        function GregorianCalendarSystem() {
        }
        GregorianCalendarSystem.prototype.getMarkerYear = function (d) {
            return d.getUTCFullYear();
        };
        GregorianCalendarSystem.prototype.getMarkerMonth = function (d) {
            return d.getUTCMonth();
        };
        GregorianCalendarSystem.prototype.getMarkerDay = function (d) {
            return d.getUTCDate();
        };
        GregorianCalendarSystem.prototype.arrayToMarker = function (arr) {
            return arrayToUtcDate(arr);
        };
        GregorianCalendarSystem.prototype.markerToArray = function (marker) {
            return dateToUtcArray(marker);
        };
        return GregorianCalendarSystem;
    }());
    registerCalendarSystem('gregory', GregorianCalendarSystem);

    var ISO_RE = /^\s*(\d{4})(-(\d{2})(-(\d{2})([T ](\d{2}):(\d{2})(:(\d{2})(\.(\d+))?)?(Z|(([-+])(\d{2})(:?(\d{2}))?))?)?)?)?$/;
    function parse(str) {
        var m = ISO_RE.exec(str);
        if (m) {
            var marker = new Date(Date.UTC(Number(m[1]), m[3] ? Number(m[3]) - 1 : 0, Number(m[5] || 1), Number(m[7] || 0), Number(m[8] || 0), Number(m[10] || 0), m[12] ? Number('0.' + m[12]) * 1000 : 0));
            if (isValidDate(marker)) {
                var timeZoneOffset = null;
                if (m[13]) {
                    timeZoneOffset = (m[15] === '-' ? -1 : 1) * (Number(m[16] || 0) * 60 +
                        Number(m[18] || 0));
                }
                return {
                    marker: marker,
                    isTimeUnspecified: !m[6],
                    timeZoneOffset: timeZoneOffset
                };
            }
        }
        return null;
    }

    var DateEnv = /** @class */ (function () {
        function DateEnv(settings) {
            var timeZone = this.timeZone = settings.timeZone;
            var isNamedTimeZone = timeZone !== 'local' && timeZone !== 'UTC';
            if (settings.namedTimeZoneImpl && isNamedTimeZone) {
                this.namedTimeZoneImpl = new settings.namedTimeZoneImpl(timeZone);
            }
            this.canComputeOffset = Boolean(!isNamedTimeZone || this.namedTimeZoneImpl);
            this.calendarSystem = createCalendarSystem(settings.calendarSystem);
            this.locale = settings.locale;
            this.weekDow = settings.locale.week.dow;
            this.weekDoy = settings.locale.week.doy;
            if (settings.weekNumberCalculation === 'ISO') {
                this.weekDow = 1;
                this.weekDoy = 4;
            }
            if (typeof settings.firstDay === 'number') {
                this.weekDow = settings.firstDay;
            }
            if (typeof settings.weekNumberCalculation === 'function') {
                this.weekNumberFunc = settings.weekNumberCalculation;
            }
            this.weekText = settings.weekText != null ? settings.weekText : settings.locale.options.weekText;
            this.cmdFormatter = settings.cmdFormatter;
        }
        // Creating / Parsing
        DateEnv.prototype.createMarker = function (input) {
            var meta = this.createMarkerMeta(input);
            if (meta === null) {
                return null;
            }
            return meta.marker;
        };
        DateEnv.prototype.createNowMarker = function () {
            if (this.canComputeOffset) {
                return this.timestampToMarker(new Date().valueOf());
            }
            else {
                // if we can't compute the current date val for a timezone,
                // better to give the current local date vals than UTC
                return arrayToUtcDate(dateToLocalArray(new Date()));
            }
        };
        DateEnv.prototype.createMarkerMeta = function (input) {
            if (typeof input === 'string') {
                return this.parse(input);
            }
            var marker = null;
            if (typeof input === 'number') {
                marker = this.timestampToMarker(input);
            }
            else if (input instanceof Date) {
                input = input.valueOf();
                if (!isNaN(input)) {
                    marker = this.timestampToMarker(input);
                }
            }
            else if (Array.isArray(input)) {
                marker = arrayToUtcDate(input);
            }
            if (marker === null || !isValidDate(marker)) {
                return null;
            }
            return { marker: marker, isTimeUnspecified: false, forcedTzo: null };
        };
        DateEnv.prototype.parse = function (s) {
            var parts = parse(s);
            if (parts === null) {
                return null;
            }
            var marker = parts.marker;
            var forcedTzo = null;
            if (parts.timeZoneOffset !== null) {
                if (this.canComputeOffset) {
                    marker = this.timestampToMarker(marker.valueOf() - parts.timeZoneOffset * 60 * 1000);
                }
                else {
                    forcedTzo = parts.timeZoneOffset;
                }
            }
            return { marker: marker, isTimeUnspecified: parts.isTimeUnspecified, forcedTzo: forcedTzo };
        };
        // Accessors
        DateEnv.prototype.getYear = function (marker) {
            return this.calendarSystem.getMarkerYear(marker);
        };
        DateEnv.prototype.getMonth = function (marker) {
            return this.calendarSystem.getMarkerMonth(marker);
        };
        // Adding / Subtracting
        DateEnv.prototype.add = function (marker, dur) {
            var a = this.calendarSystem.markerToArray(marker);
            a[0] += dur.years;
            a[1] += dur.months;
            a[2] += dur.days;
            a[6] += dur.milliseconds;
            return this.calendarSystem.arrayToMarker(a);
        };
        DateEnv.prototype.subtract = function (marker, dur) {
            var a = this.calendarSystem.markerToArray(marker);
            a[0] -= dur.years;
            a[1] -= dur.months;
            a[2] -= dur.days;
            a[6] -= dur.milliseconds;
            return this.calendarSystem.arrayToMarker(a);
        };
        DateEnv.prototype.addYears = function (marker, n) {
            var a = this.calendarSystem.markerToArray(marker);
            a[0] += n;
            return this.calendarSystem.arrayToMarker(a);
        };
        DateEnv.prototype.addMonths = function (marker, n) {
            var a = this.calendarSystem.markerToArray(marker);
            a[1] += n;
            return this.calendarSystem.arrayToMarker(a);
        };
        // Diffing Whole Units
        DateEnv.prototype.diffWholeYears = function (m0, m1) {
            var calendarSystem = this.calendarSystem;
            if (timeAsMs(m0) === timeAsMs(m1) &&
                calendarSystem.getMarkerDay(m0) === calendarSystem.getMarkerDay(m1) &&
                calendarSystem.getMarkerMonth(m0) === calendarSystem.getMarkerMonth(m1)) {
                return calendarSystem.getMarkerYear(m1) - calendarSystem.getMarkerYear(m0);
            }
            return null;
        };
        DateEnv.prototype.diffWholeMonths = function (m0, m1) {
            var calendarSystem = this.calendarSystem;
            if (timeAsMs(m0) === timeAsMs(m1) &&
                calendarSystem.getMarkerDay(m0) === calendarSystem.getMarkerDay(m1)) {
                return (calendarSystem.getMarkerMonth(m1) - calendarSystem.getMarkerMonth(m0)) +
                    (calendarSystem.getMarkerYear(m1) - calendarSystem.getMarkerYear(m0)) * 12;
            }
            return null;
        };
        // Range / Duration
        DateEnv.prototype.greatestWholeUnit = function (m0, m1) {
            var n = this.diffWholeYears(m0, m1);
            if (n !== null) {
                return { unit: 'year', value: n };
            }
            n = this.diffWholeMonths(m0, m1);
            if (n !== null) {
                return { unit: 'month', value: n };
            }
            n = diffWholeWeeks(m0, m1);
            if (n !== null) {
                return { unit: 'week', value: n };
            }
            n = diffWholeDays(m0, m1);
            if (n !== null) {
                return { unit: 'day', value: n };
            }
            n = diffHours(m0, m1);
            if (isInt(n)) {
                return { unit: 'hour', value: n };
            }
            n = diffMinutes(m0, m1);
            if (isInt(n)) {
                return { unit: 'minute', value: n };
            }
            n = diffSeconds(m0, m1);
            if (isInt(n)) {
                return { unit: 'second', value: n };
            }
            return { unit: 'millisecond', value: m1.valueOf() - m0.valueOf() };
        };
        DateEnv.prototype.countDurationsBetween = function (m0, m1, d) {
            // TODO: can use greatestWholeUnit
            var diff;
            if (d.years) {
                diff = this.diffWholeYears(m0, m1);
                if (diff !== null) {
                    return diff / asRoughYears(d);
                }
            }
            if (d.months) {
                diff = this.diffWholeMonths(m0, m1);
                if (diff !== null) {
                    return diff / asRoughMonths(d);
                }
            }
            if (d.days) {
                diff = diffWholeDays(m0, m1);
                if (diff !== null) {
                    return diff / asRoughDays(d);
                }
            }
            return (m1.valueOf() - m0.valueOf()) / asRoughMs(d);
        };
        // Start-Of
        // these DON'T return zoned-dates. only UTC start-of dates
        DateEnv.prototype.startOf = function (m, unit) {
            if (unit === 'year') {
                return this.startOfYear(m);
            }
            else if (unit === 'month') {
                return this.startOfMonth(m);
            }
            else if (unit === 'week') {
                return this.startOfWeek(m);
            }
            else if (unit === 'day') {
                return startOfDay(m);
            }
            else if (unit === 'hour') {
                return startOfHour(m);
            }
            else if (unit === 'minute') {
                return startOfMinute(m);
            }
            else if (unit === 'second') {
                return startOfSecond(m);
            }
        };
        DateEnv.prototype.startOfYear = function (m) {
            return this.calendarSystem.arrayToMarker([
                this.calendarSystem.getMarkerYear(m)
            ]);
        };
        DateEnv.prototype.startOfMonth = function (m) {
            return this.calendarSystem.arrayToMarker([
                this.calendarSystem.getMarkerYear(m),
                this.calendarSystem.getMarkerMonth(m)
            ]);
        };
        DateEnv.prototype.startOfWeek = function (m) {
            return this.calendarSystem.arrayToMarker([
                this.calendarSystem.getMarkerYear(m),
                this.calendarSystem.getMarkerMonth(m),
                m.getUTCDate() - ((m.getUTCDay() - this.weekDow + 7) % 7)
            ]);
        };
        // Week Number
        DateEnv.prototype.computeWeekNumber = function (marker) {
            if (this.weekNumberFunc) {
                return this.weekNumberFunc(this.toDate(marker));
            }
            else {
                return weekOfYear(marker, this.weekDow, this.weekDoy);
            }
        };
        // TODO: choke on timeZoneName: long
        DateEnv.prototype.format = function (marker, formatter, dateOptions) {
            if (dateOptions === void 0) { dateOptions = {}; }
            return formatter.format({
                marker: marker,
                timeZoneOffset: dateOptions.forcedTzo != null ?
                    dateOptions.forcedTzo :
                    this.offsetForMarker(marker)
            }, this);
        };
        DateEnv.prototype.formatRange = function (start, end, formatter, dateOptions) {
            if (dateOptions === void 0) { dateOptions = {}; }
            if (dateOptions.isEndExclusive) {
                end = addMs(end, -1);
            }
            return formatter.formatRange({
                marker: start,
                timeZoneOffset: dateOptions.forcedStartTzo != null ?
                    dateOptions.forcedStartTzo :
                    this.offsetForMarker(start)
            }, {
                marker: end,
                timeZoneOffset: dateOptions.forcedEndTzo != null ?
                    dateOptions.forcedEndTzo :
                    this.offsetForMarker(end)
            }, this);
        };
        /*
        DUMB: the omitTime arg is dumb. if we omit the time, we want to omit the timezone offset. and if we do that,
        might as well use buildIsoString or some other util directly
        */
        DateEnv.prototype.formatIso = function (marker, extraOptions) {
            if (extraOptions === void 0) { extraOptions = {}; }
            var timeZoneOffset = null;
            if (!extraOptions.omitTimeZoneOffset) {
                if (extraOptions.forcedTzo != null) {
                    timeZoneOffset = extraOptions.forcedTzo;
                }
                else {
                    timeZoneOffset = this.offsetForMarker(marker);
                }
            }
            return buildIsoString(marker, timeZoneOffset, extraOptions.omitTime);
        };
        // TimeZone
        DateEnv.prototype.timestampToMarker = function (ms) {
            if (this.timeZone === 'local') {
                return arrayToUtcDate(dateToLocalArray(new Date(ms)));
            }
            else if (this.timeZone === 'UTC' || !this.namedTimeZoneImpl) {
                return new Date(ms);
            }
            else {
                return arrayToUtcDate(this.namedTimeZoneImpl.timestampToArray(ms));
            }
        };
        DateEnv.prototype.offsetForMarker = function (m) {
            if (this.timeZone === 'local') {
                return -arrayToLocalDate(dateToUtcArray(m)).getTimezoneOffset(); // convert "inverse" offset to "normal" offset
            }
            else if (this.timeZone === 'UTC') {
                return 0;
            }
            else if (this.namedTimeZoneImpl) {
                return this.namedTimeZoneImpl.offsetForArray(dateToUtcArray(m));
            }
            return null;
        };
        // Conversion
        DateEnv.prototype.toDate = function (m, forcedTzo) {
            if (this.timeZone === 'local') {
                return arrayToLocalDate(dateToUtcArray(m));
            }
            else if (this.timeZone === 'UTC') {
                return new Date(m.valueOf()); // make sure it's a copy
            }
            else if (!this.namedTimeZoneImpl) {
                return new Date(m.valueOf() - (forcedTzo || 0));
            }
            else {
                return new Date(m.valueOf() -
                    this.namedTimeZoneImpl.offsetForArray(dateToUtcArray(m)) * 1000 * 60 // convert minutes -> ms
                );
            }
        };
        return DateEnv;
    }());

    var SIMPLE_SOURCE_PROPS = {
        id: String,
        defaultAllDay: Boolean,
        eventDataTransform: Function,
        success: Function,
        failure: Function
    };
    function doesSourceNeedRange(eventSource, calendar) {
        var defs = calendar.pluginSystem.hooks.eventSourceDefs;
        return !defs[eventSource.sourceDefId].ignoreRange;
    }
    function parseEventSource(raw, calendar) {
        var defs = calendar.pluginSystem.hooks.eventSourceDefs;
        for (var i = defs.length - 1; i >= 0; i--) { // later-added plugins take precedence
            var def = defs[i];
            var meta = def.parseMeta(raw);
            if (meta) {
                var res = parseEventSourceProps(typeof raw === 'object' ? raw : {}, meta, i, calendar);
                res._raw = raw;
                return res;
            }
        }
        return null;
    }
    function parseEventSourceProps(raw, meta, sourceDefId, calendar) {
        var leftovers0 = {};
        var props = refineProps(raw, SIMPLE_SOURCE_PROPS, {}, leftovers0);
        var leftovers1 = {};
        var ui = processUnscopedUiProps(leftovers0, calendar, leftovers1);
        props.isFetching = false;
        props.latestFetchId = '';
        props.fetchRange = null;
        props.publicId = String(raw.id || '');
        props.sourceId = guid();
        props.sourceDefId = sourceDefId;
        props.meta = meta;
        props.ui = ui;
        props.extendedProps = leftovers1;
        return props;
    }

    function reduceEventSources (eventSources, action, dateProfile, calendar) {
        switch (action.type) {
            case 'ADD_EVENT_SOURCES': // already parsed
                return addSources(eventSources, action.sources, dateProfile ? dateProfile.activeRange : null, calendar);
            case 'REMOVE_EVENT_SOURCE':
                return removeSource(eventSources, action.sourceId);
            case 'PREV': // TODO: how do we track all actions that affect dateProfile :(
            case 'NEXT':
            case 'SET_DATE':
            case 'SET_VIEW_TYPE':
                if (dateProfile) {
                    return fetchDirtySources(eventSources, dateProfile.activeRange, calendar);
                }
                else {
                    return eventSources;
                }
            case 'FETCH_EVENT_SOURCES':
            case 'CHANGE_TIMEZONE':
                return fetchSourcesByIds(eventSources, action.sourceIds ?
                    arrayToHash(action.sourceIds) :
                    excludeStaticSources(eventSources, calendar), dateProfile ? dateProfile.activeRange : null, calendar);
            case 'RECEIVE_EVENTS':
            case 'RECEIVE_EVENT_ERROR':
                return receiveResponse(eventSources, action.sourceId, action.fetchId, action.fetchRange);
            case 'REMOVE_ALL_EVENT_SOURCES':
                return {};
            default:
                return eventSources;
        }
    }
    function addSources(eventSourceHash, sources, fetchRange, calendar) {
        var hash = {};
        for (var _i = 0, sources_1 = sources; _i < sources_1.length; _i++) {
            var source = sources_1[_i];
            hash[source.sourceId] = source;
        }
        if (fetchRange) {
            hash = fetchDirtySources(hash, fetchRange, calendar);
        }
        return __assign(__assign({}, eventSourceHash), hash);
    }
    function removeSource(eventSourceHash, sourceId) {
        return filterHash(eventSourceHash, function (eventSource) {
            return eventSource.sourceId !== sourceId;
        });
    }
    function fetchDirtySources(sourceHash, fetchRange, calendar) {
        return fetchSourcesByIds(sourceHash, filterHash(sourceHash, function (eventSource) {
            return isSourceDirty(eventSource, fetchRange, calendar);
        }), fetchRange, calendar);
    }
    function isSourceDirty(eventSource, fetchRange, calendar) {
        if (!doesSourceNeedRange(eventSource, calendar)) {
            return !eventSource.latestFetchId;
        }
        else {
            return !calendar.opt('lazyFetching') ||
                !eventSource.fetchRange ||
                eventSource.isFetching || // always cancel outdated in-progress fetches
                fetchRange.start < eventSource.fetchRange.start ||
                fetchRange.end > eventSource.fetchRange.end;
        }
    }
    function fetchSourcesByIds(prevSources, sourceIdHash, fetchRange, calendar) {
        var nextSources = {};
        for (var sourceId in prevSources) {
            var source = prevSources[sourceId];
            if (sourceIdHash[sourceId]) {
                nextSources[sourceId] = fetchSource(source, fetchRange, calendar);
            }
            else {
                nextSources[sourceId] = source;
            }
        }
        return nextSources;
    }
    function fetchSource(eventSource, fetchRange, calendar) {
        var sourceDef = calendar.pluginSystem.hooks.eventSourceDefs[eventSource.sourceDefId];
        var fetchId = guid();
        sourceDef.fetch({
            eventSource: eventSource,
            calendar: calendar,
            range: fetchRange
        }, function (res) {
            var rawEvents = res.rawEvents;
            var sourceSuccessRes;
            if (eventSource.success) {
                sourceSuccessRes = eventSource.success(rawEvents, res.xhr);
            }
            var calSuccessRes = calendar.publiclyTrigger('eventSourceSuccess', [rawEvents, res.xhr]);
            rawEvents = sourceSuccessRes || calSuccessRes || rawEvents;
            calendar.dispatch({
                type: 'RECEIVE_EVENTS',
                sourceId: eventSource.sourceId,
                fetchId: fetchId,
                fetchRange: fetchRange,
                rawEvents: rawEvents
            });
        }, function (error) {
            console.warn(error.message, error);
            if (eventSource.failure) {
                eventSource.failure(error);
            }
            calendar.publiclyTrigger('eventSourceFailure', [error]);
            calendar.dispatch({
                type: 'RECEIVE_EVENT_ERROR',
                sourceId: eventSource.sourceId,
                fetchId: fetchId,
                fetchRange: fetchRange,
                error: error
            });
        });
        return __assign(__assign({}, eventSource), { isFetching: true, latestFetchId: fetchId });
    }
    function receiveResponse(sourceHash, sourceId, fetchId, fetchRange) {
        var _a;
        var eventSource = sourceHash[sourceId];
        if (eventSource && // not already removed
            fetchId === eventSource.latestFetchId) {
            return __assign(__assign({}, sourceHash), (_a = {}, _a[sourceId] = __assign(__assign({}, eventSource), { isFetching: false, fetchRange: fetchRange // also serves as a marker that at least one fetch has completed
             }), _a));
        }
        return sourceHash;
    }
    function excludeStaticSources(eventSources, calendar) {
        return filterHash(eventSources, function (eventSource) {
            return doesSourceNeedRange(eventSource, calendar);
        });
    }

    var DateProfileGenerator = /** @class */ (function () {
        function DateProfileGenerator(viewSpec, calendar) {
            this.viewSpec = viewSpec;
            this.options = viewSpec.options;
            this.slotMinTime = calendar.slotMinTime;
            this.slotMaxTime = calendar.slotMaxTime;
            this.dateEnv = calendar.dateEnv;
            this.calendar = calendar;
            this.initHiddenDays();
        }
        /* Date Range Computation
        ------------------------------------------------------------------------------------------------------------------*/
        // Builds a structure with info about what the dates/ranges will be for the "prev" view.
        DateProfileGenerator.prototype.buildPrev = function (currentDateProfile, currentDate) {
            var dateEnv = this.dateEnv;
            var prevDate = dateEnv.subtract(dateEnv.startOf(currentDate, currentDateProfile.currentRangeUnit), // important for start-of-month
            currentDateProfile.dateIncrement);
            return this.build(prevDate, -1);
        };
        // Builds a structure with info about what the dates/ranges will be for the "next" view.
        DateProfileGenerator.prototype.buildNext = function (currentDateProfile, currentDate) {
            var dateEnv = this.dateEnv;
            var nextDate = dateEnv.add(dateEnv.startOf(currentDate, currentDateProfile.currentRangeUnit), // important for start-of-month
            currentDateProfile.dateIncrement);
            return this.build(nextDate, 1);
        };
        // Builds a structure holding dates/ranges for rendering around the given date.
        // Optional direction param indicates whether the date is being incremented/decremented
        // from its previous value. decremented = -1, incremented = 1 (default).
        DateProfileGenerator.prototype.build = function (currentDate, direction, forceToValid) {
            if (forceToValid === void 0) { forceToValid = false; }
            var validRange;
            var currentInfo;
            var isRangeAllDay;
            var renderRange;
            var activeRange;
            var isValid;
            validRange = this.buildValidRange();
            validRange = this.trimHiddenDays(validRange);
            if (forceToValid) {
                currentDate = constrainMarkerToRange(currentDate, validRange);
            }
            currentInfo = this.buildCurrentRangeInfo(currentDate, direction);
            isRangeAllDay = /^(year|month|week|day)$/.test(currentInfo.unit);
            renderRange = this.buildRenderRange(this.trimHiddenDays(currentInfo.range), currentInfo.unit, isRangeAllDay);
            renderRange = this.trimHiddenDays(renderRange);
            activeRange = renderRange;
            if (!this.options.showNonCurrentDates) {
                activeRange = intersectRanges(activeRange, currentInfo.range);
            }
            activeRange = this.adjustActiveRange(activeRange);
            activeRange = intersectRanges(activeRange, validRange); // might return null
            // it's invalid if the originally requested date is not contained,
            // or if the range is completely outside of the valid range.
            isValid = rangesIntersect(currentInfo.range, validRange);
            return {
                // constraint for where prev/next operations can go and where events can be dragged/resized to.
                // an object with optional start and end properties.
                validRange: validRange,
                // range the view is formally responsible for.
                // for example, a month view might have 1st-31st, excluding padded dates
                currentRange: currentInfo.range,
                // name of largest unit being displayed, like "month" or "week"
                currentRangeUnit: currentInfo.unit,
                isRangeAllDay: isRangeAllDay,
                // dates that display events and accept drag-n-drop
                // will be `null` if no dates accept events
                activeRange: activeRange,
                // date range with a rendered skeleton
                // includes not-active days that need some sort of DOM
                renderRange: renderRange,
                // Duration object that denotes the first visible time of any given day
                slotMinTime: this.slotMinTime,
                // Duration object that denotes the exclusive visible end time of any given day
                slotMaxTime: this.slotMaxTime,
                isValid: isValid,
                // how far the current date will move for a prev/next operation
                dateIncrement: this.buildDateIncrement(currentInfo.duration)
                // pass a fallback (might be null) ^
            };
        };
        // Builds an object with optional start/end properties.
        // Indicates the minimum/maximum dates to display.
        // not responsible for trimming hidden days.
        DateProfileGenerator.prototype.buildValidRange = function () {
            return this.getRangeOption('validRange', this.calendar.getNow()) ||
                { start: null, end: null }; // completely open-ended
        };
        // Builds a structure with info about the "current" range, the range that is
        // highlighted as being the current month for example.
        // See build() for a description of `direction`.
        // Guaranteed to have `range` and `unit` properties. `duration` is optional.
        DateProfileGenerator.prototype.buildCurrentRangeInfo = function (date, direction) {
            var _a = this, viewSpec = _a.viewSpec, dateEnv = _a.dateEnv;
            var duration = null;
            var unit = null;
            var range = null;
            var dayCount;
            if (viewSpec.duration) {
                duration = viewSpec.duration;
                unit = viewSpec.durationUnit;
                range = this.buildRangeFromDuration(date, direction, duration, unit);
            }
            else if ((dayCount = this.options.dayCount)) {
                unit = 'day';
                range = this.buildRangeFromDayCount(date, direction, dayCount);
            }
            else if ((range = this.buildCustomVisibleRange(date))) {
                unit = dateEnv.greatestWholeUnit(range.start, range.end).unit;
            }
            else {
                duration = this.getFallbackDuration();
                unit = greatestDurationDenominator(duration).unit;
                range = this.buildRangeFromDuration(date, direction, duration, unit);
            }
            return { duration: duration, unit: unit, range: range };
        };
        DateProfileGenerator.prototype.getFallbackDuration = function () {
            return createDuration({ day: 1 });
        };
        // Returns a new activeRange to have time values (un-ambiguate)
        // slotMinTime or slotMaxTime causes the range to expand.
        DateProfileGenerator.prototype.adjustActiveRange = function (range) {
            var _a = this, dateEnv = _a.dateEnv, slotMinTime = _a.slotMinTime, slotMaxTime = _a.slotMaxTime;
            var start = range.start;
            var end = range.end;
            if (this.viewSpec.options.usesMinMaxTime) {
                // expand active range if slotMinTime is negative (why not when positive?)
                if (asRoughDays(slotMinTime) < 0) {
                    start = startOfDay(start); // necessary?
                    start = dateEnv.add(start, slotMinTime);
                }
                // expand active range if slotMaxTime is beyond one day (why not when negative?)
                if (asRoughDays(slotMaxTime) > 1) {
                    end = startOfDay(end); // necessary?
                    end = addDays(end, -1);
                    end = dateEnv.add(end, slotMaxTime);
                }
            }
            return { start: start, end: end };
        };
        // Builds the "current" range when it is specified as an explicit duration.
        // `unit` is the already-computed greatestDurationDenominator unit of duration.
        DateProfileGenerator.prototype.buildRangeFromDuration = function (date, direction, duration, unit) {
            var dateEnv = this.dateEnv;
            var alignment = this.options.dateAlignment;
            var dateIncrementInput;
            var dateIncrementDuration;
            var start;
            var end;
            var res;
            // compute what the alignment should be
            if (!alignment) {
                dateIncrementInput = this.options.dateIncrement;
                if (dateIncrementInput) {
                    dateIncrementDuration = createDuration(dateIncrementInput);
                    // use the smaller of the two units
                    if (asRoughMs(dateIncrementDuration) < asRoughMs(duration)) {
                        alignment = greatestDurationDenominator(dateIncrementDuration, !getWeeksFromInput(dateIncrementInput)).unit;
                    }
                    else {
                        alignment = unit;
                    }
                }
                else {
                    alignment = unit;
                }
            }
            // if the view displays a single day or smaller
            if (asRoughDays(duration) <= 1) {
                if (this.isHiddenDay(start)) {
                    start = this.skipHiddenDays(start, direction);
                    start = startOfDay(start);
                }
            }
            function computeRes() {
                start = dateEnv.startOf(date, alignment);
                end = dateEnv.add(start, duration);
                res = { start: start, end: end };
            }
            computeRes();
            // if range is completely enveloped by hidden days, go past the hidden days
            if (!this.trimHiddenDays(res)) {
                date = this.skipHiddenDays(date, direction);
                computeRes();
            }
            return res;
        };
        // Builds the "current" range when a dayCount is specified.
        DateProfileGenerator.prototype.buildRangeFromDayCount = function (date, direction, dayCount) {
            var dateEnv = this.dateEnv;
            var customAlignment = this.options.dateAlignment;
            var runningCount = 0;
            var start = date;
            var end;
            if (customAlignment) {
                start = dateEnv.startOf(start, customAlignment);
            }
            start = startOfDay(start);
            start = this.skipHiddenDays(start, direction);
            end = start;
            do {
                end = addDays(end, 1);
                if (!this.isHiddenDay(end)) {
                    runningCount++;
                }
            } while (runningCount < dayCount);
            return { start: start, end: end };
        };
        // Builds a normalized range object for the "visible" range,
        // which is a way to define the currentRange and activeRange at the same time.
        DateProfileGenerator.prototype.buildCustomVisibleRange = function (date) {
            var dateEnv = this.dateEnv;
            var visibleRange = this.getRangeOption('visibleRange', dateEnv.toDate(date));
            if (visibleRange && (visibleRange.start == null || visibleRange.end == null)) {
                return null;
            }
            return visibleRange;
        };
        // Computes the range that will represent the element/cells for *rendering*,
        // but which may have voided days/times.
        // not responsible for trimming hidden days.
        DateProfileGenerator.prototype.buildRenderRange = function (currentRange, currentRangeUnit, isRangeAllDay) {
            return currentRange;
        };
        // Compute the duration value that should be added/substracted to the current date
        // when a prev/next operation happens.
        DateProfileGenerator.prototype.buildDateIncrement = function (fallback) {
            var dateIncrementInput = this.options.dateIncrement;
            var customAlignment;
            if (dateIncrementInput) {
                return createDuration(dateIncrementInput);
            }
            else if ((customAlignment = this.options.dateAlignment)) {
                return createDuration(1, customAlignment);
            }
            else if (fallback) {
                return fallback;
            }
            else {
                return createDuration({ days: 1 });
            }
        };
        // Arguments after name will be forwarded to a hypothetical function value
        // WARNING: passed-in arguments will be given to generator functions as-is and can cause side-effects.
        // Always clone your objects if you fear mutation.
        DateProfileGenerator.prototype.getRangeOption = function (name) {
            var otherArgs = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                otherArgs[_i - 1] = arguments[_i];
            }
            var val = this.options[name];
            if (typeof val === 'function') {
                val = val.apply(null, otherArgs);
            }
            if (val) {
                val = parseRange(val, this.dateEnv);
            }
            if (val) {
                val = computeVisibleDayRange(val);
            }
            return val;
        };
        /* Hidden Days
        ------------------------------------------------------------------------------------------------------------------*/
        // Initializes internal variables related to calculating hidden days-of-week
        DateProfileGenerator.prototype.initHiddenDays = function () {
            var hiddenDays = this.options.hiddenDays || []; // array of day-of-week indices that are hidden
            var isHiddenDayHash = []; // is the day-of-week hidden? (hash with day-of-week-index -> bool)
            var dayCnt = 0;
            var i;
            if (this.options.weekends === false) {
                hiddenDays.push(0, 6); // 0=sunday, 6=saturday
            }
            for (i = 0; i < 7; i++) {
                if (!(isHiddenDayHash[i] = hiddenDays.indexOf(i) !== -1)) {
                    dayCnt++;
                }
            }
            if (!dayCnt) {
                throw new Error('invalid hiddenDays'); // all days were hidden? bad.
            }
            this.isHiddenDayHash = isHiddenDayHash;
        };
        // Remove days from the beginning and end of the range that are computed as hidden.
        // If the whole range is trimmed off, returns null
        DateProfileGenerator.prototype.trimHiddenDays = function (range) {
            var start = range.start;
            var end = range.end;
            if (start) {
                start = this.skipHiddenDays(start);
            }
            if (end) {
                end = this.skipHiddenDays(end, -1, true);
            }
            if (start == null || end == null || start < end) {
                return { start: start, end: end };
            }
            return null;
        };
        // Is the current day hidden?
        // `day` is a day-of-week index (0-6), or a Date (used for UTC)
        DateProfileGenerator.prototype.isHiddenDay = function (day) {
            if (day instanceof Date) {
                day = day.getUTCDay();
            }
            return this.isHiddenDayHash[day];
        };
        // Incrementing the current day until it is no longer a hidden day, returning a copy.
        // DOES NOT CONSIDER validRange!
        // If the initial value of `date` is not a hidden day, don't do anything.
        // Pass `isExclusive` as `true` if you are dealing with an end date.
        // `inc` defaults to `1` (increment one day forward each time)
        DateProfileGenerator.prototype.skipHiddenDays = function (date, inc, isExclusive) {
            if (inc === void 0) { inc = 1; }
            if (isExclusive === void 0) { isExclusive = false; }
            while (this.isHiddenDayHash[(date.getUTCDay() + (isExclusive ? inc : 0) + 7) % 7]) {
                date = addDays(date, inc);
            }
            return date;
        };
        return DateProfileGenerator;
    }());
    // TODO: find a way to avoid comparing DateProfiles. it's tedious
    function isDateProfilesEqual(p0, p1) {
        return rangesEqual(p0.validRange, p1.validRange) &&
            rangesEqual(p0.activeRange, p1.activeRange) &&
            rangesEqual(p0.renderRange, p1.renderRange) &&
            durationsEqual(p0.slotMinTime, p1.slotMinTime) &&
            durationsEqual(p0.slotMaxTime, p1.slotMaxTime);
        /*
        TODO: compare more?
          currentRange: DateRange
          currentRangeUnit: string
          isRangeAllDay: boolean
          isValid: boolean
          dateIncrement: Duration
        */
    }

    function reduce (state, action, calendar) {
        var viewType = reduceViewType(state.viewType, action);
        var dateProfile = reduceDateProfile(state.dateProfile, action, state.currentDate, viewType, calendar);
        var eventSources = reduceEventSources(state.eventSources, action, dateProfile, calendar);
        var nextState = __assign(__assign({}, state), { viewType: viewType,
            dateProfile: dateProfile, currentDate: reduceCurrentDate(state.currentDate, action, dateProfile), eventSources: eventSources, eventStore: reduceEventStore(state.eventStore, action, eventSources, dateProfile, calendar), dateSelection: reduceDateSelection(state.dateSelection, action), eventSelection: reduceSelectedEvent(state.eventSelection, action), eventDrag: reduceEventDrag(state.eventDrag, action), eventResize: reduceEventResize(state.eventResize, action), eventSourceLoadingLevel: computeLoadingLevel(eventSources), loadingLevel: computeLoadingLevel(eventSources) });
        for (var _i = 0, _a = calendar.pluginSystem.hooks.reducers; _i < _a.length; _i++) {
            var reducerFunc = _a[_i];
            nextState = reducerFunc(nextState, action, calendar);
        }
        // console.log(action.type, nextState)
        return nextState;
    }
    function reduceViewType(currentViewType, action) {
        switch (action.type) {
            case 'SET_VIEW_TYPE':
                return action.viewType;
            default:
                return currentViewType;
        }
    }
    function reduceDateProfile(currentDateProfile, action, currentDate, viewType, calendar) {
        var newDateProfile;
        switch (action.type) {
            case 'PREV':
                newDateProfile = calendar.dateProfileGenerators[viewType].buildPrev(currentDateProfile, currentDate);
                break;
            case 'NEXT':
                newDateProfile = calendar.dateProfileGenerators[viewType].buildNext(currentDateProfile, currentDate);
                break;
            case 'SET_DATE':
                if (!currentDateProfile.activeRange ||
                    !rangeContainsMarker(currentDateProfile.currentRange, action.dateMarker)) {
                    newDateProfile = calendar.dateProfileGenerators[viewType].build(action.dateMarker, undefined, true // forceToValid
                    );
                }
                break;
            case 'SET_VIEW_TYPE':
                var generator = calendar.dateProfileGenerators[viewType];
                if (!generator) {
                    throw new Error(viewType ?
                        'The FullCalendar view "' + viewType + '" does not exist. Make sure your plugins are loaded correctly.' :
                        'No available FullCalendar view plugins.');
                }
                newDateProfile = generator.build(action.dateMarker || currentDate, undefined, true // forceToValid
                );
                break;
        }
        if (newDateProfile &&
            newDateProfile.isValid &&
            !(currentDateProfile && isDateProfilesEqual(currentDateProfile, newDateProfile))) {
            return newDateProfile;
        }
        else {
            return currentDateProfile;
        }
    }
    function reduceCurrentDate(currentDate, action, dateProfile) {
        switch (action.type) {
            case 'PREV':
            case 'NEXT':
                if (!rangeContainsMarker(dateProfile.currentRange, currentDate)) {
                    return dateProfile.currentRange.start;
                }
                else {
                    return currentDate;
                }
            case 'SET_DATE':
            case 'SET_VIEW_TYPE':
                var newDate = action.dateMarker || currentDate;
                if (dateProfile.activeRange && !rangeContainsMarker(dateProfile.activeRange, newDate)) {
                    return dateProfile.currentRange.start;
                }
                else {
                    return newDate;
                }
            default:
                return currentDate;
        }
    }
    function reduceDateSelection(currentSelection, action, calendar) {
        switch (action.type) {
            case 'SELECT_DATES':
                return action.selection;
            case 'UNSELECT_DATES':
                return null;
            default:
                return currentSelection;
        }
    }
    function reduceSelectedEvent(currentInstanceId, action) {
        switch (action.type) {
            case 'SELECT_EVENT':
                return action.eventInstanceId;
            case 'UNSELECT_EVENT':
                return '';
            default:
                return currentInstanceId;
        }
    }
    function reduceEventDrag(currentDrag, action, sources, calendar) {
        switch (action.type) {
            case 'SET_EVENT_DRAG':
                var newDrag = action.state;
                return {
                    affectedEvents: newDrag.affectedEvents,
                    mutatedEvents: newDrag.mutatedEvents,
                    isEvent: newDrag.isEvent
                };
            case 'UNSET_EVENT_DRAG':
                return null;
            default:
                return currentDrag;
        }
    }
    function reduceEventResize(currentResize, action, sources, calendar) {
        switch (action.type) {
            case 'SET_EVENT_RESIZE':
                var newResize = action.state;
                return {
                    affectedEvents: newResize.affectedEvents,
                    mutatedEvents: newResize.mutatedEvents,
                    isEvent: newResize.isEvent
                };
            case 'UNSET_EVENT_RESIZE':
                return null;
            default:
                return currentResize;
        }
    }
    function computeLoadingLevel(eventSources) {
        var cnt = 0;
        for (var sourceId in eventSources) {
            if (eventSources[sourceId].isFetching) {
                cnt++;
            }
        }
        return cnt;
    }

    var STANDARD_PROPS = {
        start: null,
        end: null,
        allDay: Boolean
    };
    function parseDateSpan(raw, dateEnv, defaultDuration) {
        var span = parseOpenDateSpan(raw, dateEnv);
        var range = span.range;
        if (!range.start) {
            return null;
        }
        if (!range.end) {
            if (defaultDuration == null) {
                return null;
            }
            else {
                range.end = dateEnv.add(range.start, defaultDuration);
            }
        }
        return span;
    }
    /*
    TODO: somehow combine with parseRange?
    Will return null if the start/end props were present but parsed invalidly.
    */
    function parseOpenDateSpan(raw, dateEnv) {
        var leftovers = {};
        var standardProps = refineProps(raw, STANDARD_PROPS, {}, leftovers);
        var startMeta = standardProps.start ? dateEnv.createMarkerMeta(standardProps.start) : null;
        var endMeta = standardProps.end ? dateEnv.createMarkerMeta(standardProps.end) : null;
        var allDay = standardProps.allDay;
        if (allDay == null) {
            allDay = (startMeta && startMeta.isTimeUnspecified) &&
                (!endMeta || endMeta.isTimeUnspecified);
        }
        // use this leftover object as the selection object
        leftovers.range = {
            start: startMeta ? startMeta.marker : null,
            end: endMeta ? endMeta.marker : null
        };
        leftovers.allDay = allDay;
        return leftovers;
    }
    function isDateSpansEqual(span0, span1) {
        return rangesEqual(span0.range, span1.range) &&
            span0.allDay === span1.allDay &&
            isSpanPropsEqual(span0, span1);
    }
    // the NON-DATE-RELATED props
    function isSpanPropsEqual(span0, span1) {
        for (var propName in span1) {
            if (propName !== 'range' && propName !== 'allDay') {
                if (span0[propName] !== span1[propName]) {
                    return false;
                }
            }
        }
        // are there any props that span0 has that span1 DOESN'T have?
        // both have range/allDay, so no need to special-case.
        for (var propName in span0) {
            if (!(propName in span1)) {
                return false;
            }
        }
        return true;
    }
    function buildDateSpanApi(span, dateEnv) {
        return {
            start: dateEnv.toDate(span.range.start),
            end: dateEnv.toDate(span.range.end),
            startStr: dateEnv.formatIso(span.range.start, { omitTime: span.allDay }),
            endStr: dateEnv.formatIso(span.range.end, { omitTime: span.allDay }),
            allDay: span.allDay
        };
    }
    function buildDatePointApi(span, dateEnv) {
        return {
            date: dateEnv.toDate(span.range.start),
            dateStr: dateEnv.formatIso(span.range.start, { omitTime: span.allDay }),
            allDay: span.allDay
        };
    }
    function fabricateEventRange(dateSpan, eventUiBases, calendar) {
        var def = parseEventDef({ editable: false }, '', // sourceId
        dateSpan.allDay, true, // hasEnd
        calendar);
        return {
            def: def,
            ui: compileEventUi(def, eventUiBases),
            instance: createEventInstance(def.defId, dateSpan.range),
            range: dateSpan.range,
            isStart: true,
            isEnd: true
        };
    }

    function compileViewDefs(defaultConfigs, overrideConfigs) {
        var hash = {};
        var viewType;
        for (viewType in defaultConfigs) {
            ensureViewDef(viewType, hash, defaultConfigs, overrideConfigs);
        }
        for (viewType in overrideConfigs) {
            ensureViewDef(viewType, hash, defaultConfigs, overrideConfigs);
        }
        return hash;
    }
    function ensureViewDef(viewType, hash, defaultConfigs, overrideConfigs) {
        if (hash[viewType]) {
            return hash[viewType];
        }
        var viewDef = buildViewDef(viewType, hash, defaultConfigs, overrideConfigs);
        if (viewDef) {
            hash[viewType] = viewDef;
        }
        return viewDef;
    }
    function buildViewDef(viewType, hash, defaultConfigs, overrideConfigs) {
        var defaultConfig = defaultConfigs[viewType];
        var overrideConfig = overrideConfigs[viewType];
        var queryProp = function (name) {
            return (defaultConfig && defaultConfig[name] !== null) ? defaultConfig[name] :
                ((overrideConfig && overrideConfig[name] !== null) ? overrideConfig[name] : null);
        };
        var theComponent = queryProp('component');
        var superType = queryProp('superType');
        var superDef = null;
        if (superType) {
            if (superType === viewType) {
                throw new Error('Can\'t have a custom view type that references itself');
            }
            superDef = ensureViewDef(superType, hash, defaultConfigs, overrideConfigs);
        }
        if (!theComponent && superDef) {
            theComponent = superDef.component;
        }
        if (!theComponent) {
            return null; // don't throw a warning, might be settings for a single-unit view
        }
        return {
            type: viewType,
            component: theComponent,
            defaults: __assign(__assign({}, (superDef ? superDef.defaults : {})), (defaultConfig ? defaultConfig.options : {})),
            overrides: __assign(__assign({}, (superDef ? superDef.overrides : {})), (overrideConfig ? overrideConfig.options : {}))
        };
    }

    // TODO: use capitalizeFirstLetter util
    var RenderHook = /** @class */ (function (_super) {
        __extends(RenderHook, _super);
        function RenderHook() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.rootElRef = y();
            _this.handleRootEl = function (el) {
                setRef(_this.rootElRef, el);
                if (_this.props.elRef) {
                    setRef(_this.props.elRef, el);
                }
            };
            return _this;
        }
        RenderHook.prototype.render = function (props, state, context) {
            var _this = this;
            return (h(MountHook, { name: props.name, hookProps: props.hookProps, options: props.options, elRef: this.handleRootEl }, function (rootElRef) { return (h(ContentHook, { name: props.name, hookProps: props.hookProps, options: props.options, defaultContent: props.defaultContent, backupElRef: _this.rootElRef }, function (innerElRef, innerContent) { return props.children(rootElRef, normalizeClassNames((props.options || context.options)[props.name ? props.name + 'ClassNames' : 'classNames'], props.hookProps), innerElRef, innerContent); })); }));
        };
        RenderHook.contextType = ComponentContextType;
        return RenderHook;
    }(m));
    var ContentHook = /** @class */ (function (_super) {
        __extends(ContentHook, _super);
        function ContentHook() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.innerElRef = y();
            return _this;
        }
        ContentHook.prototype.render = function (props) {
            return props.children(this.innerElRef, this.renderInnerContent());
        };
        ContentHook.prototype.componentDidMount = function () {
            this.updateCustomContent();
        };
        ContentHook.prototype.componentDidUpdate = function () {
            this.updateCustomContent();
        };
        ContentHook.prototype.renderInnerContent = function () {
            var contentTypeHandlers = this.context.pluginHooks.contentTypeHandlers;
            var _a = this, props = _a.props, customContentInfo = _a.customContentInfo;
            var rawVal = (this.props.options || this.context.options)[props.name ? props.name + 'Content' : 'content'];
            var innerContent = normalizeContent(rawVal, props.hookProps);
            var innerContentVDom = null;
            if (innerContent === undefined) { // use the default
                innerContent = normalizeContent(props.defaultContent, props.hookProps);
            }
            if (innerContent !== undefined) { // we allow custom content handlers to return nothing
                if (customContentInfo) {
                    customContentInfo.contentVal = innerContent[customContentInfo.contentKey];
                }
                else {
                    // look for a prop that would indicate a custom content handler is needed
                    for (var contentKey in contentTypeHandlers) {
                        if (innerContent[contentKey] !== undefined) {
                            customContentInfo = this.customContentInfo = {
                                contentKey: contentKey,
                                contentVal: innerContent[contentKey],
                                handler: contentTypeHandlers[contentKey]()
                            };
                            break;
                        }
                    }
                }
                if (customContentInfo) {
                    innerContentVDom = []; // signal that something was specified
                }
                else {
                    innerContentVDom = innerContent; // assume a [p]react vdom node. use it
                }
            }
            return innerContentVDom;
        };
        ContentHook.prototype.updateCustomContent = function () {
            if (this.customContentInfo) {
                this.customContentInfo.handler(this.innerElRef.current || this.props.backupElRef.current, // the element to render into
                this.customContentInfo.contentVal);
            }
        };
        ContentHook.contextType = ComponentContextType;
        return ContentHook;
    }(m));
    var MountHook = /** @class */ (function (_super) {
        __extends(MountHook, _super);
        function MountHook() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.handleRootEl = function (rootEl) {
                _this.rootEl = rootEl;
                if (_this.props.elRef) {
                    setRef(_this.props.elRef, rootEl);
                }
            };
            return _this;
        }
        MountHook.prototype.render = function (props) {
            return props.children(this.handleRootEl);
        };
        MountHook.prototype.componentDidMount = function () {
            this.triggerMountHandler('DidMount', 'didMount');
        };
        MountHook.prototype.componentWillUnmount = function () {
            this.triggerMountHandler('WillUnmount', 'willUnmount');
        };
        MountHook.prototype.triggerMountHandler = function (postfix, simplePostfix) {
            var name = this.props.name;
            var handler = (this.props.options || this.context.options)[name ? name + postfix : simplePostfix];
            if (handler) {
                handler(__assign(__assign({}, this.props.hookProps), { el: this.rootEl }));
            }
        };
        MountHook.contextType = ComponentContextType;
        return MountHook;
    }(m));
    function buildHookClassNameGenerator(hookName) {
        var currentRawGenerator;
        var currentContext;
        var currentCacheBuster;
        var currentClassNames;
        return function (hookProps, context, optionsOverride, cacheBusterOverride) {
            var rawGenerator = (optionsOverride || context.options)[hookName ? hookName + 'ClassNames' : 'classNames'];
            var cacheBuster = cacheBusterOverride || hookProps;
            if (currentRawGenerator !== rawGenerator ||
                currentContext !== context ||
                (!currentCacheBuster || !isPropsEqual(currentCacheBuster, cacheBuster))) {
                currentClassNames = normalizeClassNames(rawGenerator, hookProps);
                currentRawGenerator = rawGenerator;
                currentContext = context;
                currentCacheBuster = cacheBuster;
            }
            return currentClassNames;
        };
    }
    function normalizeClassNames(classNames, hookProps) {
        if (typeof classNames === 'function') {
            classNames = classNames(hookProps);
        }
        if (Array.isArray(classNames)) {
            return classNames;
        }
        else if (typeof classNames === 'string') {
            return classNames.split(' ');
        }
        else {
            return [];
        }
    }
    function normalizeContent(input, hookProps) {
        if (typeof input === 'function') {
            return input(hookProps, h); // give the function the vdom-creation func
        }
        else {
            return input;
        }
    }

    var ViewRoot = /** @class */ (function (_super) {
        __extends(ViewRoot, _super);
        function ViewRoot() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.buildClassNames = buildHookClassNameGenerator('view');
            return _this;
        }
        ViewRoot.prototype.render = function (props, state, context) {
            var hookProps = { view: context.view };
            var customClassNames = this.buildClassNames(hookProps, context);
            return (h(MountHook, { name: 'view', hookProps: hookProps, elRef: props.elRef }, function (rootElRef) { return props.children(rootElRef, ["fc-" + props.viewSpec.type + "-view", 'fc-view'].concat(customClassNames)); }));
        };
        return ViewRoot;
    }(BaseComponent));

    function parseViewConfigs(inputs) {
        return mapHash(inputs, parseViewConfig);
    }
    var VIEW_DEF_PROPS = {
        type: String,
        component: null
    };
    function parseViewConfig(input) {
        if (typeof input === 'function') {
            input = { component: input };
        }
        var options = {};
        var props = refineProps(input, VIEW_DEF_PROPS, {}, options);
        var component = props.component;
        if (options.content) {
            component = createViewHookComponent(options);
            // TODO: remove content/classNames/didMount/etc from options?
        }
        return {
            superType: props.type,
            component: component,
            options: options
        };
    }
    function createViewHookComponent(options) {
        return function (viewProps) {
            return (h(ComponentContextType.Consumer, null, function (context) { return (h(ViewRoot, { viewSpec: viewProps.viewSpec }, function (rootElRef, viewClassNames) {
                var hookProps = __assign(__assign({}, viewProps), { nextDayThreshold: context.nextDayThreshold });
                return (h(RenderHook, { name: '', options: options, hookProps: hookProps, elRef: rootElRef }, function (rootElRef, customClassNames, innerElRef, innerContent) { return (h("div", { className: viewClassNames.concat(customClassNames).join(' '), ref: rootElRef }, innerContent)); }));
            })); }));
        };
    }

    function buildViewSpecs(defaultInputs, optionsManager) {
        var defaultConfigs = parseViewConfigs(defaultInputs);
        var overrideConfigs = parseViewConfigs(optionsManager.overrides.views);
        var viewDefs = compileViewDefs(defaultConfigs, overrideConfigs);
        return mapHash(viewDefs, function (viewDef) {
            return buildViewSpec(viewDef, overrideConfigs, optionsManager);
        });
    }
    function buildViewSpec(viewDef, overrideConfigs, optionsManager) {
        var durationInput = viewDef.overrides.duration ||
            viewDef.defaults.duration ||
            optionsManager.dynamicOverrides.duration ||
            optionsManager.overrides.duration;
        var duration = null;
        var durationUnit = '';
        var singleUnit = '';
        var singleUnitOverrides = {};
        if (durationInput) {
            duration = createDuration(durationInput);
            if (duration) { // valid?
                var denom = greatestDurationDenominator(duration, !getWeeksFromInput(durationInput));
                durationUnit = denom.unit;
                if (denom.value === 1) {
                    singleUnit = durationUnit;
                    singleUnitOverrides = overrideConfigs[durationUnit] ? overrideConfigs[durationUnit].options : {};
                }
            }
        }
        var queryButtonText = function (options) {
            var buttonTextMap = options.buttonText || {};
            var buttonTextKey = viewDef.defaults.buttonTextKey;
            if (buttonTextKey != null && buttonTextMap[buttonTextKey] != null) {
                return buttonTextMap[buttonTextKey];
            }
            if (buttonTextMap[viewDef.type] != null) {
                return buttonTextMap[viewDef.type];
            }
            if (buttonTextMap[singleUnit] != null) {
                return buttonTextMap[singleUnit];
            }
        };
        return {
            type: viewDef.type,
            component: viewDef.component,
            duration: duration,
            durationUnit: durationUnit,
            singleUnit: singleUnit,
            options: __assign(__assign(__assign(__assign(__assign(__assign(__assign({}, globalDefaults), viewDef.defaults), optionsManager.localeDefaults), optionsManager.overrides), singleUnitOverrides), viewDef.overrides), optionsManager.dynamicOverrides),
            buttonTextOverride: queryButtonText(optionsManager.dynamicOverrides) ||
                queryButtonText(optionsManager.overrides) || // constructor-specified buttonText lookup hash takes precedence
                viewDef.overrides.buttonText,
            buttonTextDefault: queryButtonText(optionsManager.localeDefaults) ||
                viewDef.defaults.buttonText ||
                queryButtonText(globalDefaults) ||
                viewDef.type // fall back to given view name
        };
    }

    function createPlugin(input) {
        return {
            id: guid(),
            deps: input.deps || [],
            reducers: input.reducers || [],
            eventDefParsers: input.eventDefParsers || [],
            isDraggableTransformers: input.isDraggableTransformers || [],
            eventDragMutationMassagers: input.eventDragMutationMassagers || [],
            eventDefMutationAppliers: input.eventDefMutationAppliers || [],
            dateSelectionTransformers: input.dateSelectionTransformers || [],
            datePointTransforms: input.datePointTransforms || [],
            dateSpanTransforms: input.dateSpanTransforms || [],
            views: input.views || {},
            viewPropsTransformers: input.viewPropsTransformers || [],
            isPropsValid: input.isPropsValid || null,
            externalDefTransforms: input.externalDefTransforms || [],
            eventResizeJoinTransforms: input.eventResizeJoinTransforms || [],
            viewContainerAppends: input.viewContainerAppends || [],
            eventDropTransformers: input.eventDropTransformers || [],
            componentInteractions: input.componentInteractions || [],
            calendarInteractions: input.calendarInteractions || [],
            themeClasses: input.themeClasses || {},
            eventSourceDefs: input.eventSourceDefs || [],
            cmdFormatter: input.cmdFormatter,
            recurringTypes: input.recurringTypes || [],
            namedTimeZonedImpl: input.namedTimeZonedImpl,
            initialView: input.initialView || '',
            elementDraggingImpl: input.elementDraggingImpl,
            optionChangeHandlers: input.optionChangeHandlers || {},
            scrollGridImpl: input.scrollGridImpl || null,
            contentTypeHandlers: input.contentTypeHandlers || {}
        };
    }
    var PluginSystem = /** @class */ (function () {
        function PluginSystem() {
            this.hooks = {
                reducers: [],
                eventDefParsers: [],
                isDraggableTransformers: [],
                eventDragMutationMassagers: [],
                eventDefMutationAppliers: [],
                dateSelectionTransformers: [],
                datePointTransforms: [],
                dateSpanTransforms: [],
                views: {},
                viewPropsTransformers: [],
                isPropsValid: null,
                externalDefTransforms: [],
                eventResizeJoinTransforms: [],
                viewContainerAppends: [],
                eventDropTransformers: [],
                componentInteractions: [],
                calendarInteractions: [],
                themeClasses: {},
                eventSourceDefs: [],
                cmdFormatter: null,
                recurringTypes: [],
                namedTimeZonedImpl: null,
                initialView: '',
                elementDraggingImpl: null,
                optionChangeHandlers: {},
                scrollGridImpl: null,
                contentTypeHandlers: {}
            };
            this.addedHash = {};
        }
        PluginSystem.prototype.add = function (plugin) {
            if (!this.addedHash[plugin.id]) {
                this.addedHash[plugin.id] = true;
                for (var _i = 0, _a = plugin.deps; _i < _a.length; _i++) {
                    var dep = _a[_i];
                    this.add(dep);
                }
                this.hooks = combineHooks(this.hooks, plugin);
            }
        };
        return PluginSystem;
    }());
    function combineHooks(hooks0, hooks1) {
        return {
            reducers: hooks0.reducers.concat(hooks1.reducers),
            eventDefParsers: hooks0.eventDefParsers.concat(hooks1.eventDefParsers),
            isDraggableTransformers: hooks0.isDraggableTransformers.concat(hooks1.isDraggableTransformers),
            eventDragMutationMassagers: hooks0.eventDragMutationMassagers.concat(hooks1.eventDragMutationMassagers),
            eventDefMutationAppliers: hooks0.eventDefMutationAppliers.concat(hooks1.eventDefMutationAppliers),
            dateSelectionTransformers: hooks0.dateSelectionTransformers.concat(hooks1.dateSelectionTransformers),
            datePointTransforms: hooks0.datePointTransforms.concat(hooks1.datePointTransforms),
            dateSpanTransforms: hooks0.dateSpanTransforms.concat(hooks1.dateSpanTransforms),
            views: __assign(__assign({}, hooks0.views), hooks1.views),
            viewPropsTransformers: hooks0.viewPropsTransformers.concat(hooks1.viewPropsTransformers),
            isPropsValid: hooks1.isPropsValid || hooks0.isPropsValid,
            externalDefTransforms: hooks0.externalDefTransforms.concat(hooks1.externalDefTransforms),
            eventResizeJoinTransforms: hooks0.eventResizeJoinTransforms.concat(hooks1.eventResizeJoinTransforms),
            viewContainerAppends: hooks0.viewContainerAppends.concat(hooks1.viewContainerAppends),
            eventDropTransformers: hooks0.eventDropTransformers.concat(hooks1.eventDropTransformers),
            calendarInteractions: hooks0.calendarInteractions.concat(hooks1.calendarInteractions),
            componentInteractions: hooks0.componentInteractions.concat(hooks1.componentInteractions),
            themeClasses: __assign(__assign({}, hooks0.themeClasses), hooks1.themeClasses),
            eventSourceDefs: hooks0.eventSourceDefs.concat(hooks1.eventSourceDefs),
            cmdFormatter: hooks1.cmdFormatter || hooks0.cmdFormatter,
            recurringTypes: hooks0.recurringTypes.concat(hooks1.recurringTypes),
            namedTimeZonedImpl: hooks1.namedTimeZonedImpl || hooks0.namedTimeZonedImpl,
            initialView: hooks0.initialView || hooks1.initialView,
            elementDraggingImpl: hooks0.elementDraggingImpl || hooks1.elementDraggingImpl,
            optionChangeHandlers: __assign(__assign({}, hooks0.optionChangeHandlers), hooks1.optionChangeHandlers),
            scrollGridImpl: hooks1.scrollGridImpl || hooks0.scrollGridImpl,
            contentTypeHandlers: __assign(__assign({}, hooks0.contentTypeHandlers), hooks1.contentTypeHandlers)
        };
    }

    var Toolbar = /** @class */ (function (_super) {
        __extends(Toolbar, _super);
        function Toolbar() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Toolbar.prototype.render = function (props) {
            var model = props.model;
            var forceLtr = false;
            var startContent, endContent;
            var centerContent = model.center;
            if (model.left) {
                forceLtr = true;
                startContent = model.left;
            }
            else {
                startContent = model.start;
            }
            if (model.right) {
                forceLtr = true;
                endContent = model.right;
            }
            else {
                endContent = model.end;
            }
            var classNames = [
                props.extraClassName || '',
                'fc-toolbar',
                forceLtr ? 'fc-toolbar-ltr' : ''
            ];
            return (h("div", { class: classNames.join(' ') },
                this.renderSection(startContent || []),
                this.renderSection(centerContent || []),
                this.renderSection(endContent || [])));
        };
        Toolbar.prototype.renderSection = function (widgetGroups) {
            var props = this.props;
            return (h(ToolbarSection, { widgetGroups: widgetGroups, title: props.title, activeButton: props.activeButton, isTodayEnabled: props.isTodayEnabled, isPrevEnabled: props.isPrevEnabled, isNextEnabled: props.isNextEnabled }));
        };
        return Toolbar;
    }(BaseComponent));
    var ToolbarSection = /** @class */ (function (_super) {
        __extends(ToolbarSection, _super);
        function ToolbarSection() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        ToolbarSection.prototype.render = function (props) {
            var theme = this.context.theme;
            return (h("div", { class: 'fc-toolbar-chunk' }, props.widgetGroups.map(function (widgetGroup) {
                var children = [];
                var isOnlyButtons = true;
                for (var _i = 0, widgetGroup_1 = widgetGroup; _i < widgetGroup_1.length; _i++) {
                    var widget = widgetGroup_1[_i];
                    var buttonName = widget.buttonName, buttonClick = widget.buttonClick, buttonText = widget.buttonText, buttonIcon = widget.buttonIcon;
                    if (buttonName === 'title') {
                        isOnlyButtons = false;
                        children.push(h("h2", { className: 'fc-toolbar-title' }, props.title));
                    }
                    else {
                        var ariaAttrs = buttonIcon ? { 'aria-label': buttonName } : {};
                        var buttonClasses = ['fc-' + buttonName + '-button', theme.getClass('button')];
                        if (buttonName === props.activeButton) {
                            buttonClasses.push(theme.getClass('buttonActive'));
                        }
                        var isDisabled = (!props.isTodayEnabled && buttonName === 'today') ||
                            (!props.isPrevEnabled && buttonName === 'prev') ||
                            (!props.isNextEnabled && buttonName === 'next');
                        children.push(h("button", __assign({ disabled: isDisabled, class: buttonClasses.join(' '), onClick: buttonClick }, ariaAttrs), buttonText || (buttonIcon ? h("span", { class: buttonIcon }) : '')));
                    }
                }
                if (children.length > 1) {
                    var groupClasses = (isOnlyButtons && theme.getClass('buttonGroup')) || '';
                    return (h("div", { class: groupClasses }, children));
                }
                else {
                    return children[0];
                }
            })));
        };
        return ToolbarSection;
    }(BaseComponent));

    // TODO: do function component?
    var ViewContainer = /** @class */ (function (_super) {
        __extends(ViewContainer, _super);
        function ViewContainer() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        ViewContainer.prototype.render = function (props) {
            var classNames = [
                'fc-view-harness',
                (props.aspectRatio || props.liquid || props.height)
                    ? 'fc-view-harness-active' // harness controls the height
                    : 'fc-view-harness-passive' // let the view do the height
            ];
            var height = '';
            var paddingBottom = '';
            if (props.aspectRatio) {
                paddingBottom = (1 / props.aspectRatio) * 100 + '%';
            }
            else {
                height = props.height || '';
            }
            return (h("div", { ref: props.elRef, onClick: props.onClick, class: classNames.join(' '), style: { height: height, paddingBottom: paddingBottom } }, props.children));
        };
        return ViewContainer;
    }(BaseComponent));

    var canVGrowWithinCell;
    function getCanVGrowWithinCell() {
        if (canVGrowWithinCell == null) {
            canVGrowWithinCell = computeCanVGrowWithinCell();
        }
        return canVGrowWithinCell;
    }
    function computeCanVGrowWithinCell() {
        // TODO: abstraction for creating these temporary detection-based els
        var el = document.createElement('div');
        el.style.position = 'absolute'; // for not interfering with current layout
        el.style.top = '0';
        el.style.left = '0';
        el.innerHTML = '<table style="height:100px"><tr><td><div style="height:100%"></div></td></tr></table>';
        document.body.appendChild(el);
        var div = el.querySelector('div');
        var possible = div.offsetHeight > 0;
        document.body.removeChild(el);
        return possible;
    }

    var CalendarComponent = /** @class */ (function (_super) {
        __extends(CalendarComponent, _super);
        function CalendarComponent() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.buildViewContext = memoize(buildContext);
            _this.parseBusinessHours = memoize(function (input) { return parseBusinessHours(input, _this.context.calendar); });
            _this.buildViewPropTransformers = memoize(buildViewPropTransformers);
            _this.buildToolbarProps = memoize(buildToolbarProps);
            _this.reportClassNames = memoize(reportClassNames);
            _this.reportHeight = memoize(reportHeight);
            _this.handleNavLinkClick = buildDelegationHandler('a[data-navlink]', _this._handleNavLinkClick.bind(_this));
            _this.headerRef = y();
            _this.footerRef = y();
            _this.viewRef = y();
            _this.state = {
                forPrint: false
            };
            _this.handleBeforePrint = function () {
                _this.setState({ forPrint: true });
            };
            _this.handleAfterPrint = function () {
                _this.setState({ forPrint: false });
            };
            return _this;
        }
        Object.defineProperty(CalendarComponent.prototype, "view", {
            get: function () { return this.viewRef.current; },
            enumerable: true,
            configurable: true
        });
        /*
        renders INSIDE of an outer div
        */
        CalendarComponent.prototype.render = function (props, state, context) {
            var calendar = context.calendar, options = context.options, headerToolbar = context.headerToolbar, footerToolbar = context.footerToolbar;
            var toolbarProps = this.buildToolbarProps(props.viewSpec, props.dateProfile, props.dateProfileGenerator, props.currentDate, calendar.getNow(), props.title);
            var calendarHeight = '';
            var viewVGrow = false;
            var viewHeight = '';
            var viewAspectRatio;
            if (isHeightAuto(options)) {
                viewHeight = '';
            }
            else if (options.height != null) {
                calendarHeight = options.height;
                viewVGrow = true;
            }
            else if (options.contentHeight != null) {
                viewHeight = options.contentHeight;
            }
            else {
                viewAspectRatio = Math.max(options.aspectRatio, 0.5); // prevent from getting too tall
            }
            if (props.onClassNameChange) {
                this.reportClassNames(props.onClassNameChange, state.forPrint, options.direction, context.theme);
            }
            if (props.onHeightChange) {
                this.reportHeight(props.onHeightChange, calendarHeight);
            }
            return (h(d, null,
                headerToolbar &&
                    h(Toolbar, __assign({ ref: this.headerRef, extraClassName: 'fc-header-toolbar', model: headerToolbar }, toolbarProps)),
                h(ViewContainer, { liquid: viewVGrow, height: viewHeight, aspectRatio: viewAspectRatio, onClick: this.handleNavLinkClick },
                    this.renderView(props, this.context),
                    this.buildAppendContent()),
                footerToolbar &&
                    h(Toolbar, __assign({ ref: this.footerRef, extraClassName: 'fc-footer-toolbar', model: footerToolbar }, toolbarProps))));
        };
        CalendarComponent.prototype.componentDidMount = function () {
            window.addEventListener('beforeprint', this.handleBeforePrint);
            window.addEventListener('afterprint', this.handleAfterPrint);
            this.context.calendar.publiclyTrigger('datesDidUpdate');
        };
        CalendarComponent.prototype.componentDidUpdate = function (prevProps) {
            if (prevProps.dateProfile !== this.props.dateProfile) {
                this.context.calendar.publiclyTrigger('datesDidUpdate');
            }
        };
        CalendarComponent.prototype.componentWillUnmount = function () {
            window.removeEventListener('beforeprint', this.handleBeforePrint);
            window.removeEventListener('afterprint', this.handleAfterPrint);
            if (this.props.onClassNameChange) {
                this.props.onClassNameChange([]);
            }
            if (this.props.onHeightChange) {
                this.props.onHeightChange('');
            }
        };
        CalendarComponent.prototype._handleNavLinkClick = function (ev, anchorEl) {
            var _a = this.context, dateEnv = _a.dateEnv, calendar = _a.calendar;
            var navLinkOptions = anchorEl.getAttribute('data-navlink');
            navLinkOptions = navLinkOptions ? JSON.parse(navLinkOptions) : {};
            var dateMarker = dateEnv.createMarker(navLinkOptions.date);
            var viewType = navLinkOptions.type;
            // property like "navLinkDayClick". might be a string or a function
            var customAction = calendar.viewOpt('navLink' + capitaliseFirstLetter(viewType) + 'Click');
            if (typeof customAction === 'function') {
                customAction(dateEnv.toDate(dateMarker), ev);
            }
            else {
                if (typeof customAction === 'string') {
                    viewType = customAction;
                }
                calendar.zoomTo(dateMarker, viewType);
            }
        };
        CalendarComponent.prototype.buildAppendContent = function () {
            var _a = this.context, pluginHooks = _a.pluginHooks, calendar = _a.calendar;
            return pluginHooks.viewContainerAppends.map(function (buildAppendContent) { return buildAppendContent(calendar); });
        };
        CalendarComponent.prototype.renderView = function (props, context) {
            var pluginHooks = context.pluginHooks, options = context.options;
            var viewSpec = props.viewSpec;
            var viewProps = {
                viewSpec: viewSpec,
                dateProfileGenerator: props.dateProfileGenerator,
                dateProfile: props.dateProfile,
                businessHours: this.parseBusinessHours(viewSpec.options.businessHours),
                eventStore: props.eventStore,
                eventUiBases: props.eventUiBases,
                dateSelection: props.dateSelection,
                eventSelection: props.eventSelection,
                eventDrag: props.eventDrag,
                eventResize: props.eventResize,
                isHeightAuto: this.state.forPrint || isHeightAuto(options),
                forPrint: this.state.forPrint
            };
            var transformers = this.buildViewPropTransformers(pluginHooks.viewPropsTransformers);
            for (var _i = 0, transformers_1 = transformers; _i < transformers_1.length; _i++) {
                var transformer = transformers_1[_i];
                __assign(viewProps, transformer.transform(viewProps, viewSpec, props, options));
            }
            var viewContext = this.buildViewContext(context.calendar, context.pluginHooks, context.dateEnv, context.theme, context.view, viewSpec.options);
            var ViewComponent = viewSpec.component;
            return (h(ComponentContextType.Provider, { value: viewContext },
                h(ViewComponent, __assign({ ref: this.viewRef }, viewProps))));
        };
        return CalendarComponent;
    }(BaseComponent));
    function buildToolbarProps(viewSpec, dateProfile, dateProfileGenerator, currentDate, now, title) {
        var todayInfo = dateProfileGenerator.build(now);
        var prevInfo = dateProfileGenerator.buildPrev(dateProfile, currentDate);
        var nextInfo = dateProfileGenerator.buildNext(dateProfile, currentDate);
        return {
            title: title,
            activeButton: viewSpec.type,
            isTodayEnabled: todayInfo.isValid && !rangeContainsMarker(dateProfile.currentRange, now),
            isPrevEnabled: prevInfo.isValid,
            isNextEnabled: nextInfo.isValid
        };
    }
    function isHeightAuto(options) {
        return options.height === 'auto' || options.contentHeight === 'auto';
    }
    // Outer Div Rendering
    // -----------------------------------------------------------------------------------------------------------------
    function reportClassNames(onClassNameChange, forPrint, direction, theme) {
        onClassNameChange(computeClassNames(forPrint, direction, theme));
    }
    // NOTE: can't have any empty! caller gets confused
    function computeClassNames(forPrint, direction, theme) {
        var classNames = [
            'fc',
            forPrint ? 'fc-media-print' : 'fc-media-screen',
            'fc-direction-' + direction,
            theme.getClass('root')
        ];
        if (!getCanVGrowWithinCell()) {
            classNames.push('fc-liquid-hack');
        }
        return classNames;
    }
    function reportHeight(onHeightChange, height) {
        onHeightChange(height);
    }
    // Plugin
    // -----------------------------------------------------------------------------------------------------------------
    function buildViewPropTransformers(theClasses) {
        return theClasses.map(function (theClass) {
            return new theClass();
        });
    }

    var Interaction = /** @class */ (function () {
        function Interaction(settings) {
            this.component = settings.component;
        }
        Interaction.prototype.destroy = function () {
        };
        return Interaction;
    }());
    function parseInteractionSettings(component, input) {
        return {
            component: component,
            el: input.el,
            useEventCenter: input.useEventCenter != null ? input.useEventCenter : true
        };
    }
    function interactionSettingsToStore(settings) {
        var _a;
        return _a = {},
            _a[settings.component.uid] = settings,
            _a;
    }
    // global state
    var interactionSettingsStore = {};

    /*
    Detects when the user clicks on an event within a DateComponent
    */
    var EventClicking = /** @class */ (function (_super) {
        __extends(EventClicking, _super);
        function EventClicking(settings) {
            var _this = _super.call(this, settings) || this;
            _this.handleSegClick = function (ev, segEl) {
                var component = _this.component;
                var _a = component.context, calendar = _a.calendar, view = _a.view;
                var seg = getElSeg(segEl);
                if (seg && // might be the <div> surrounding the more link
                    component.isValidSegDownEl(ev.target)) {
                    // our way to simulate a link click for elements that can't be <a> tags
                    // grab before trigger fired in case trigger trashes DOM thru rerendering
                    var hasUrlContainer = elementClosest(ev.target, '.fc-event-forced-url');
                    var url = hasUrlContainer ? hasUrlContainer.querySelector('a[href]').href : '';
                    calendar.publiclyTrigger('eventClick', [
                        {
                            el: segEl,
                            event: new EventApi(component.context.calendar, seg.eventRange.def, seg.eventRange.instance),
                            jsEvent: ev,
                            view: view
                        }
                    ]);
                    if (url && !ev.defaultPrevented) {
                        window.location.href = url;
                    }
                }
            };
            _this.destroy = listenBySelector(settings.el, 'click', '.fc-event', // on both fg and bg events
            _this.handleSegClick);
            return _this;
        }
        return EventClicking;
    }(Interaction));

    /*
    Triggers events and adds/removes core classNames when the user's pointer
    enters/leaves event-elements of a component.
    */
    var EventHovering = /** @class */ (function (_super) {
        __extends(EventHovering, _super);
        function EventHovering(settings) {
            var _this = _super.call(this, settings) || this;
            // for simulating an eventMouseLeave when the event el is destroyed while mouse is over it
            _this.handleEventElRemove = function (el) {
                if (el === _this.currentSegEl) {
                    _this.handleSegLeave(null, _this.currentSegEl);
                }
            };
            _this.handleSegEnter = function (ev, segEl) {
                if (getElSeg(segEl)) { // TODO: better way to make sure not hovering over more+ link or its wrapper
                    segEl.classList.add('fc-event-resizable-mouse');
                    _this.currentSegEl = segEl;
                    _this.triggerEvent('eventMouseEnter', ev, segEl);
                }
            };
            _this.handleSegLeave = function (ev, segEl) {
                if (_this.currentSegEl) {
                    segEl.classList.remove('fc-event-resizable-mouse');
                    _this.currentSegEl = null;
                    _this.triggerEvent('eventMouseLeave', ev, segEl);
                }
            };
            var component = settings.component;
            _this.removeHoverListeners = listenToHoverBySelector(settings.el, '.fc-event', // on both fg and bg events
            _this.handleSegEnter, _this.handleSegLeave);
            // how to make sure component already has context?
            component.context.calendar.on('eventElRemove', _this.handleEventElRemove);
            return _this;
        }
        EventHovering.prototype.destroy = function () {
            this.removeHoverListeners();
            this.component.context.calendar.off('eventElRemove', this.handleEventElRemove);
        };
        EventHovering.prototype.triggerEvent = function (publicEvName, ev, segEl) {
            var component = this.component;
            var _a = component.context, calendar = _a.calendar, view = _a.view;
            var seg = getElSeg(segEl);
            if (!ev || component.isValidSegDownEl(ev.target)) {
                calendar.publiclyTrigger(publicEvName, [
                    {
                        el: segEl,
                        event: new EventApi(calendar, seg.eventRange.def, seg.eventRange.instance),
                        jsEvent: ev,
                        view: view
                    }
                ]);
            }
        };
        return EventHovering;
    }(Interaction));

    var StandardTheme = /** @class */ (function (_super) {
        __extends(StandardTheme, _super);
        function StandardTheme() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return StandardTheme;
    }(Theme));
    StandardTheme.prototype.classes = {
        root: 'fc-theme-standard',
        buttonGroup: 'fc-button-group',
        button: 'fc-button fc-button-primary',
        buttonActive: 'fc-button-active'
    };
    StandardTheme.prototype.baseIconClass = 'fc-icon';
    StandardTheme.prototype.iconClasses = {
        close: 'fc-icon-x',
        prev: 'fc-icon-chevron-left',
        next: 'fc-icon-chevron-right',
        prevYear: 'fc-icon-chevrons-left',
        nextYear: 'fc-icon-chevrons-right'
    };
    StandardTheme.prototype.rtlIconClasses = {
        prev: 'fc-icon-chevron-right',
        next: 'fc-icon-chevron-left',
        prevYear: 'fc-icon-chevrons-right',
        nextYear: 'fc-icon-chevrons-left'
    };
    StandardTheme.prototype.iconOverrideOption = 'buttonIcons';
    StandardTheme.prototype.iconOverrideCustomButtonOption = 'icon';
    StandardTheme.prototype.iconOverridePrefix = 'fc-icon-';

    var DelayedRunner = /** @class */ (function () {
        function DelayedRunner(drainedOption) {
            this.drainedOption = drainedOption;
            this.isRunning = false;
            this.isDirty = false;
            this.pauseDepths = {};
            this.timeoutId = 0;
        }
        DelayedRunner.prototype.request = function (delay) {
            this.isDirty = true;
            if (!this.isPaused()) {
                this.clearTimeout();
                if (delay == null) {
                    this.tryDrain();
                }
                else {
                    this.timeoutId = setTimeout(// NOT OPTIMAL! TODO: look at debounce
                    this.tryDrain.bind(this), delay);
                }
            }
        };
        DelayedRunner.prototype.pause = function (scope) {
            if (scope === void 0) { scope = ''; }
            var pauseDepths = this.pauseDepths;
            pauseDepths[scope] = (pauseDepths[scope] || 0) + 1;
            this.clearTimeout();
        };
        DelayedRunner.prototype.resume = function (scope, force) {
            if (scope === void 0) { scope = ''; }
            var pauseDepths = this.pauseDepths;
            if (scope in pauseDepths) {
                if (force) {
                    delete pauseDepths[scope];
                }
                else {
                    var depth = --pauseDepths[scope];
                    if (depth <= 0) {
                        delete pauseDepths[scope];
                    }
                }
                this.tryDrain();
            }
        };
        DelayedRunner.prototype.isPaused = function () {
            return Object.keys(this.pauseDepths).length;
        };
        DelayedRunner.prototype.tryDrain = function () {
            if (!this.isRunning && !this.isPaused()) {
                this.isRunning = true;
                while (this.isDirty) {
                    this.isDirty = false;
                    this.drained(); // might set isDirty to true again
                }
                this.isRunning = false;
            }
        };
        DelayedRunner.prototype.clear = function () {
            this.clearTimeout();
            this.isDirty = false;
            this.pauseDepths = {};
        };
        DelayedRunner.prototype.clearTimeout = function () {
            if (this.timeoutId) {
                clearTimeout(this.timeoutId);
                this.timeoutId = 0;
            }
        };
        DelayedRunner.prototype.drained = function () {
            if (this.drainedOption) {
                this.drainedOption();
            }
        };
        return DelayedRunner;
    }());
    var TaskRunner = /** @class */ (function () {
        function TaskRunner(runTaskOption, drainedOption) {
            this.runTaskOption = runTaskOption;
            this.drainedOption = drainedOption;
            this.queue = [];
            this.delayedRunner = new DelayedRunner(this.drain.bind(this));
        }
        TaskRunner.prototype.request = function (task, delay) {
            this.queue.push(task);
            this.delayedRunner.request(delay);
        };
        TaskRunner.prototype.pause = function (scope) {
            this.delayedRunner.pause(scope);
        };
        TaskRunner.prototype.resume = function (scope, force) {
            this.delayedRunner.resume(scope, force);
        };
        TaskRunner.prototype.drain = function () {
            var queue = this.queue;
            while (queue.length) {
                var completedTasks = [];
                var task = void 0;
                while (task = queue.shift()) {
                    this.runTask(task);
                    completedTasks.push(task);
                }
                this.drained(completedTasks);
            } // keep going, in case new tasks were added in the drained handler
        };
        TaskRunner.prototype.runTask = function (task) {
            if (this.runTaskOption) {
                this.runTaskOption(task);
            }
        };
        TaskRunner.prototype.drained = function (completedTasks) {
            if (this.drainedOption) {
                this.drainedOption(completedTasks);
            }
        };
        return TaskRunner;
    }());

    var eventSourceDef = {
        ignoreRange: true,
        parseMeta: function (raw) {
            if (Array.isArray(raw)) { // short form
                return raw;
            }
            else if (Array.isArray(raw.events)) {
                return raw.events;
            }
            return null;
        },
        fetch: function (arg, success) {
            success({
                rawEvents: arg.eventSource.meta
            });
        }
    };
    var ArrayEventSourcePlugin = createPlugin({
        eventSourceDefs: [eventSourceDef]
    });

    var eventSourceDef$1 = {
        parseMeta: function (raw) {
            if (typeof raw === 'function') { // short form
                return raw;
            }
            else if (typeof raw.events === 'function') {
                return raw.events;
            }
            return null;
        },
        fetch: function (arg, success, failure) {
            var dateEnv = arg.calendar.dateEnv;
            var func = arg.eventSource.meta;
            unpromisify(func.bind(null, {
                start: dateEnv.toDate(arg.range.start),
                end: dateEnv.toDate(arg.range.end),
                startStr: dateEnv.formatIso(arg.range.start),
                endStr: dateEnv.formatIso(arg.range.end),
                timeZone: dateEnv.timeZone
            }), function (rawEvents) {
                success({ rawEvents: rawEvents }); // needs an object response
            }, failure // send errorObj directly to failure callback
            );
        }
    };
    var FuncEventSourcePlugin = createPlugin({
        eventSourceDefs: [eventSourceDef$1]
    });

    function requestJson(method, url, params, successCallback, failureCallback) {
        method = method.toUpperCase();
        var body = null;
        if (method === 'GET') {
            url = injectQueryStringParams(url, params);
        }
        else {
            body = encodeParams(params);
        }
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        if (method !== 'GET') {
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        }
        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 400) {
                var parsed = false;
                var res = void 0;
                try {
                    res = JSON.parse(xhr.responseText);
                    parsed = true;
                }
                catch (err) { }
                if (parsed) {
                    successCallback(res, xhr);
                }
                else {
                    failureCallback('Failure parsing JSON', xhr);
                }
            }
            else {
                failureCallback('Request failed', xhr);
            }
        };
        xhr.onerror = function () {
            failureCallback('Request failed', xhr);
        };
        xhr.send(body);
    }
    function injectQueryStringParams(url, params) {
        return url +
            (url.indexOf('?') === -1 ? '?' : '&') +
            encodeParams(params);
    }
    function encodeParams(params) {
        var parts = [];
        for (var key in params) {
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
        }
        return parts.join('&');
    }

    var eventSourceDef$2 = {
        parseMeta: function (raw) {
            if (typeof raw === 'string') { // short form
                raw = { url: raw };
            }
            else if (!raw || typeof raw !== 'object' || !raw.url) {
                return null;
            }
            return {
                url: raw.url,
                method: (raw.method || 'GET').toUpperCase(),
                extraParams: raw.extraParams,
                startParam: raw.startParam,
                endParam: raw.endParam,
                timeZoneParam: raw.timeZoneParam
            };
        },
        fetch: function (arg, success, failure) {
            var meta = arg.eventSource.meta;
            var requestParams = buildRequestParams(meta, arg.range, arg.calendar);
            requestJson(meta.method, meta.url, requestParams, function (rawEvents, xhr) {
                success({ rawEvents: rawEvents, xhr: xhr });
            }, function (errorMessage, xhr) {
                failure({ message: errorMessage, xhr: xhr });
            });
        }
    };
    var JsonFeedEventSourcePlugin = createPlugin({
        eventSourceDefs: [eventSourceDef$2]
    });
    function buildRequestParams(meta, range, calendar) {
        var dateEnv = calendar.dateEnv;
        var startParam;
        var endParam;
        var timeZoneParam;
        var customRequestParams;
        var params = {};
        startParam = meta.startParam;
        if (startParam == null) {
            startParam = calendar.opt('startParam');
        }
        endParam = meta.endParam;
        if (endParam == null) {
            endParam = calendar.opt('endParam');
        }
        timeZoneParam = meta.timeZoneParam;
        if (timeZoneParam == null) {
            timeZoneParam = calendar.opt('timeZoneParam');
        }
        // retrieve any outbound GET/POST data from the options
        if (typeof meta.extraParams === 'function') {
            // supplied as a function that returns a key/value object
            customRequestParams = meta.extraParams();
        }
        else {
            // probably supplied as a straight key/value object
            customRequestParams = meta.extraParams || {};
        }
        __assign(params, customRequestParams);
        params[startParam] = dateEnv.formatIso(range.start);
        params[endParam] = dateEnv.formatIso(range.end);
        if (dateEnv.timeZone !== 'local') {
            params[timeZoneParam] = dateEnv.timeZone;
        }
        return params;
    }

    var recurring = {
        parse: function (rawEvent, leftoverProps, dateEnv) {
            var createMarker = dateEnv.createMarker.bind(dateEnv);
            var processors = {
                daysOfWeek: null,
                startTime: createDuration,
                endTime: createDuration,
                startRecur: createMarker,
                endRecur: createMarker
            };
            var props = refineProps(rawEvent, processors, {}, leftoverProps);
            var anyValid = false;
            for (var propName in props) {
                if (props[propName] != null) {
                    anyValid = true;
                    break;
                }
            }
            if (anyValid) {
                var duration = null;
                if ('duration' in leftoverProps) {
                    duration = createDuration(leftoverProps.duration);
                    delete leftoverProps.duration;
                }
                if (!duration && props.startTime && props.endTime) {
                    duration = subtractDurations(props.endTime, props.startTime);
                }
                return {
                    allDayGuess: Boolean(!props.startTime && !props.endTime),
                    duration: duration,
                    typeData: props // doesn't need endTime anymore but oh well
                };
            }
            return null;
        },
        expand: function (typeData, framingRange, dateEnv) {
            var clippedFramingRange = intersectRanges(framingRange, { start: typeData.startRecur, end: typeData.endRecur });
            if (clippedFramingRange) {
                return expandRanges(typeData.daysOfWeek, typeData.startTime, clippedFramingRange, dateEnv);
            }
            else {
                return [];
            }
        }
    };
    var SimpleRecurrencePlugin = createPlugin({
        recurringTypes: [recurring]
    });
    function expandRanges(daysOfWeek, startTime, framingRange, dateEnv) {
        var dowHash = daysOfWeek ? arrayToHash(daysOfWeek) : null;
        var dayMarker = startOfDay(framingRange.start);
        var endMarker = framingRange.end;
        var instanceStarts = [];
        while (dayMarker < endMarker) {
            var instanceStart 
            // if everyday, or this particular day-of-week
            = void 0;
            // if everyday, or this particular day-of-week
            if (!dowHash || dowHash[dayMarker.getUTCDay()]) {
                if (startTime) {
                    instanceStart = dateEnv.add(dayMarker, startTime);
                }
                else {
                    instanceStart = dayMarker;
                }
                instanceStarts.push(instanceStart);
            }
            dayMarker = addDays(dayMarker, 1);
        }
        return instanceStarts;
    }

    var DefaultOptionChangeHandlers = createPlugin({
        optionChangeHandlers: {
            events: function (events, calendar) {
                handleEventSources([events], calendar);
            },
            eventSources: handleEventSources,
            plugins: handlePlugins
        }
    });
    /*
    BUG: if `event` was supplied, all previously-given `eventSources` will be wiped out
    */
    function handleEventSources(inputs, calendar) {
        var unfoundSources = hashValuesToArray(calendar.state.eventSources);
        var newInputs = [];
        for (var _i = 0, inputs_1 = inputs; _i < inputs_1.length; _i++) {
            var input = inputs_1[_i];
            var inputFound = false;
            for (var i = 0; i < unfoundSources.length; i++) {
                if (unfoundSources[i]._raw === input) {
                    unfoundSources.splice(i, 1); // delete
                    inputFound = true;
                    break;
                }
            }
            if (!inputFound) {
                newInputs.push(input);
            }
        }
        for (var _a = 0, unfoundSources_1 = unfoundSources; _a < unfoundSources_1.length; _a++) {
            var unfoundSource = unfoundSources_1[_a];
            calendar.dispatch({
                type: 'REMOVE_EVENT_SOURCE',
                sourceId: unfoundSource.sourceId
            });
        }
        for (var _b = 0, newInputs_1 = newInputs; _b < newInputs_1.length; _b++) {
            var newInput = newInputs_1[_b];
            calendar.addEventSource(newInput);
        }
    }
    // shortcoming: won't remove plugins
    function handlePlugins(pluginDefs, calendar) {
        calendar.addPluginDefs(pluginDefs); // will gracefully handle duplicates
    }

    /*
    this array is exposed on the root namespace so that UMD plugins can add to it.
    see the rollup-bundles script.
    */
    var globalPlugins = [
        ArrayEventSourcePlugin,
        FuncEventSourcePlugin,
        JsonFeedEventSourcePlugin,
        SimpleRecurrencePlugin,
        DefaultOptionChangeHandlers,
        createPlugin({
            contentTypeHandlers: {
                html: function () { return injectHtml; },
                domNodes: function () { return injectDomNodes; }
            }
        })
    ];

    var Calendar = /** @class */ (function () {
        function Calendar(el, overrides) {
            var _this = this;
            // derived state
            // TODO: make these all private
            this.organizeRawLocales = memoize(organizeRawLocales);
            this.buildDateEnv = memoize(buildDateEnv);
            this.computeTitle = memoize(computeTitle);
            this.buildTheme = memoize(buildTheme);
            this.buildContext = memoize(buildContext);
            this.buildEventUiSingleBase = memoize(buildEventUiSingleBase);
            this.buildSelectionConfig = memoize(buildSelectionConfig);
            this.buildEventUiBySource = memoize(buildEventUiBySource, isPropsEqual);
            this.buildEventUiBases = memoize(buildEventUiBases);
            this.resizeHandlers = [];
            this.interactionsStore = {};
            this.isRendering = false;
            this.isRendered = false;
            this.currentClassNames = [];
            this.componentRef = y();
            this.handleClassNames = function (classNames) {
                var classList = _this.el.classList;
                for (var _i = 0, _a = _this.currentClassNames; _i < _a.length; _i++) {
                    var className = _a[_i];
                    classList.remove(className);
                }
                for (var _b = 0, classNames_1 = classNames; _b < classNames_1.length; _b++) {
                    var className = classNames_1[_b];
                    classList.add(className);
                }
                _this.currentClassNames = classNames;
            };
            this.handleHeightChange = function (height) {
                applyStyleProp(_this.el, 'height', height);
            };
            // RE-Sizing
            // -----------------------------------------------------------------------------------------------------------------
            this.resizeRunner = new DelayedRunner(function () {
                _this.triggerResizeHandlers(true); // should window resizes be considered "forced" ?
                _this.publiclyTrigger('windowResize', [_this.context.view]);
            });
            this.handleWindowResize = function (ev) {
                var options = _this.context.options;
                if (options.handleWindowResize &&
                    ev.target === window // avoid jqui events
                ) {
                    _this.resizeRunner.request(options.windowResizeDelay);
                }
            };
            this.addResizeHandler = function (handler) {
                _this.resizeHandlers.push(handler);
            };
            this.removeResizeHandler = function (handler) {
                removeExact(_this.resizeHandlers, handler);
            };
            this.el = el;
            var optionsManager = this.optionsManager = new OptionsManager(overrides || {});
            this.pluginSystem = new PluginSystem();
            var renderRunner = this.renderRunner = new DelayedRunner(this.updateComponent.bind(this));
            var actionRunner = this.actionRunner = new TaskRunner(this.runAction.bind(this), function () {
                _this.updateDerivedState();
                renderRunner.request(optionsManager.computed.rerenderDelay);
            });
            actionRunner.pause();
            // only do once. don't do in onOptionsChange. because can't remove plugins
            this.addPluginDefs(globalPlugins.concat(optionsManager.computed.plugins || []));
            this.onOptionsChange();
            this.publiclyTrigger('_init'); // for tests
            this.hydrate();
            actionRunner.resume();
            this.calendarInteractions = this.pluginSystem.hooks.calendarInteractions
                .map(function (calendarInteractionClass) {
                return new calendarInteractionClass(_this);
            });
        }
        Object.defineProperty(Calendar.prototype, "component", {
            get: function () { return this.componentRef.current; },
            enumerable: true,
            configurable: true
        });
        Calendar.prototype.addPluginDefs = function (pluginDefs) {
            for (var _i = 0, pluginDefs_1 = pluginDefs; _i < pluginDefs_1.length; _i++) {
                var pluginDef = pluginDefs_1[_i];
                this.pluginSystem.add(pluginDef);
            }
        };
        // Public API for rendering
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.render = function () {
            if (!this.isRendering) {
                this.isRendering = true;
                this.renderableEventStore = createEmptyEventStore();
                this.renderRunner.request();
                window.addEventListener('resize', this.handleWindowResize);
            }
            else {
                // hack for RERENDERING
                this.setOption('renderId', guid());
            }
        };
        Calendar.prototype.destroy = function () {
            if (this.isRendering) {
                this.isRendering = false;
                this.renderRunner.request();
                this.resizeRunner.clear();
                window.removeEventListener('resize', this.handleWindowResize);
            }
        };
        // Dispatcher
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.hydrate = function () {
            this.state = this.buildInitialState();
            var rawSources = this.opt('eventSources') || [];
            var singleRawSource = this.opt('events');
            var sources = []; // parsed
            if (singleRawSource) {
                rawSources.unshift(singleRawSource);
            }
            for (var _i = 0, rawSources_1 = rawSources; _i < rawSources_1.length; _i++) {
                var rawSource = rawSources_1[_i];
                var source = parseEventSource(rawSource, this);
                if (source) {
                    sources.push(source);
                }
            }
            this.dispatch({ type: 'INIT' }); // pass in sources here?
            this.dispatch({ type: 'ADD_EVENT_SOURCES', sources: sources });
            this.dispatch({
                type: 'SET_VIEW_TYPE',
                viewType: this.opt('initialView') || this.pluginSystem.hooks.initialView
            });
        };
        Calendar.prototype.buildInitialState = function () {
            return {
                viewType: null,
                loadingLevel: 0,
                eventSourceLoadingLevel: 0,
                currentDate: this.getInitialDate(),
                dateProfile: null,
                eventSources: {},
                eventStore: createEmptyEventStore(),
                dateSelection: null,
                eventSelection: '',
                eventDrag: null,
                eventResize: null
            };
        };
        Calendar.prototype.dispatch = function (action) {
            this.actionRunner.request(action);
            // actions we know we want to render immediately. TODO: another param in dispatch instead?
            switch (action.type) {
                case 'SET_EVENT_DRAG':
                case 'SET_EVENT_RESIZE':
                    this.renderRunner.tryDrain();
            }
        };
        Calendar.prototype.runAction = function (action) {
            var oldState = this.state;
            var newState = this.state = reduce(this.state, action, this);
            if (!oldState.loadingLevel && newState.loadingLevel) {
                this.publiclyTrigger('loading', [true]);
            }
            else if (oldState.loadingLevel && !newState.loadingLevel) {
                this.publiclyTrigger('loading', [false]);
            }
        };
        // Rendering
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.batchRendering = function (func) {
            this.renderRunner.pause('batchRendering');
            func();
            this.renderRunner.resume('batchRendering');
        };
        Calendar.prototype.pauseRendering = function () {
            this.renderRunner.pause('pauseRendering');
        };
        Calendar.prototype.resumeRendering = function () {
            this.renderRunner.resume('pauseRendering', true);
        };
        Calendar.prototype.updateComponent = function () {
            if (this.isRendering) {
                this.renderComponent();
                this.isRendered = true;
            }
            else {
                if (this.isRendered) {
                    this.destroyComponent();
                    this.isRendered = false;
                }
            }
        };
        Calendar.prototype.renderComponent = function () {
            var _a = this, context = _a.context, state = _a.state;
            var viewType = state.viewType;
            var viewSpec = this.viewSpecs[viewType];
            var viewApi = context.view;
            // if event sources are still loading and progressive rendering hasn't been enabled,
            // keep rendering the last fully loaded set of events
            var renderableEventStore = this.renderableEventStore =
                (state.eventSourceLoadingLevel && !this.opt('progressiveEventRendering')) ?
                    this.renderableEventStore :
                    state.eventStore;
            var eventUiSingleBase = this.buildEventUiSingleBase(viewSpec.options);
            var eventUiBySource = this.buildEventUiBySource(state.eventSources);
            var eventUiBases = this.eventUiBases = this.buildEventUiBases(renderableEventStore.defs, eventUiSingleBase, eventUiBySource);
            H(h(ComponentContextType.Provider, { value: context },
                h(CalendarComponent, __assign({ ref: this.componentRef }, state, { viewSpec: viewSpec, dateProfileGenerator: this.dateProfileGenerators[viewType], dateProfile: state.dateProfile, eventStore: renderableEventStore, eventUiBases: eventUiBases, dateSelection: state.dateSelection, eventSelection: state.eventSelection, eventDrag: state.eventDrag, eventResize: state.eventResize, title: viewApi.title, onClassNameChange: this.handleClassNames, onHeightChange: this.handleHeightChange }))), this.el);
            flushToDom();
        };
        Calendar.prototype.destroyComponent = function () {
            H(null, this.el);
            for (var _i = 0, _a = this.calendarInteractions; _i < _a.length; _i++) {
                var interaction = _a[_i];
                interaction.destroy();
            }
            this.publiclyTrigger('_destroyed');
        };
        // Options
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.setOption = function (name, val) {
            var _a;
            this.mutateOptions((_a = {}, _a[name] = val, _a), [], true);
        };
        Calendar.prototype.getOption = function (name) {
            return this.optionsManager.computed[name];
        };
        Calendar.prototype.opt = function (name) {
            return this.optionsManager.computed[name];
        };
        Calendar.prototype.viewOpt = function (name) {
            return this.viewSpecs[this.state.viewType].options[name];
        };
        /*
        handles option changes (like a diff)
        */
        Calendar.prototype.mutateOptions = function (updates, removals, isDynamic) {
            var _this = this;
            if (removals === void 0) { removals = []; }
            var changeHandlers = this.pluginSystem.hooks.optionChangeHandlers;
            var normalUpdates = {};
            var specialUpdates = {};
            var oldDateEnv = this.dateEnv; // do this before onOptionsChange
            var isTimeZoneDirty = false;
            var anyDifficultOptions = Boolean(removals.length); // pretty much all options are "difficult" :(
            for (var name_1 in updates) {
                if (changeHandlers[name_1]) {
                    specialUpdates[name_1] = updates[name_1];
                }
                else {
                    normalUpdates[name_1] = updates[name_1];
                }
            }
            for (var name_2 in normalUpdates) {
                if (/^(initialDate|initialView)$/.test(name_2)) ;
                else {
                    anyDifficultOptions = true; // I guess all options are "difficult" ?
                    if (name_2 === 'timeZone') {
                        isTimeZoneDirty = true;
                    }
                }
            }
            this.optionsManager.mutate(normalUpdates, removals, isDynamic);
            if (anyDifficultOptions) {
                this.onOptionsChange();
            }
            this.batchRendering(function () {
                if (anyDifficultOptions) {
                    if (isTimeZoneDirty) {
                        _this.dispatch({
                            type: 'CHANGE_TIMEZONE',
                            oldDateEnv: oldDateEnv
                        });
                    }
                    /* HACK
                    has the same effect as calling this.updateComponent()
                    but recomputes the state's dateProfile
                    */
                    _this.dispatch({
                        type: 'SET_VIEW_TYPE',
                        viewType: _this.state.viewType
                    });
                }
                // special updates
                for (var name_3 in specialUpdates) {
                    changeHandlers[name_3](specialUpdates[name_3], _this);
                }
            });
        };
        /*
        rebuilds things based off of a complete set of refined options
        TODO: move all this to updateDerivedState, but hard because reducer depends on some values
        */
        Calendar.prototype.onOptionsChange = function () {
            var _this = this;
            var pluginHooks = this.pluginSystem.hooks;
            var rawOptions = this.optionsManager.computed;
            var availableLocaleData = this.organizeRawLocales(rawOptions.locales);
            var dateEnv = this.buildDateEnv(rawOptions, pluginHooks, availableLocaleData);
            this.availableRawLocales = availableLocaleData.map;
            this.dateEnv = dateEnv;
            // TODO: don't do every time
            this.viewSpecs = buildViewSpecs(pluginHooks.views, this.optionsManager);
            // needs to happen before dateProfileGenerators
            this.slotMinTime = createDuration(rawOptions.slotMinTime);
            this.slotMaxTime = createDuration(rawOptions.slotMaxTime);
            // needs to happen after dateEnv assigned :( because DateProfileGenerator grabs onto reference
            // TODO: don't do every time
            this.dateProfileGenerators = mapHash(this.viewSpecs, function (viewSpec) {
                var dateProfileGeneratorClass = viewSpec.options.dateProfileGeneratorClass || DateProfileGenerator;
                return new dateProfileGeneratorClass(viewSpec, _this);
            });
            // TODO: don't do every time
            this.defaultAllDayEventDuration = createDuration(rawOptions.defaultAllDayEventDuration);
            this.defaultTimedEventDuration = createDuration(rawOptions.defaultTimedEventDuration);
        };
        /*
        always executes after onOptionsChange
        */
        Calendar.prototype.updateDerivedState = function () {
            var pluginHooks = this.pluginSystem.hooks;
            var rawOptions = this.optionsManager.computed;
            var dateEnv = this.dateEnv;
            var _a = this.state, viewType = _a.viewType, dateProfile = _a.dateProfile;
            var viewSpec = this.viewSpecs[viewType];
            if (!viewSpec) {
                throw new Error("View type \"" + viewType + "\" is not valid");
            }
            var theme = this.buildTheme(rawOptions, pluginHooks);
            var title = this.computeTitle(dateProfile, dateEnv, viewSpec.options);
            var viewApi = this.buildViewApi(viewType, title, dateProfile, dateEnv);
            var context = this.buildContext(this, pluginHooks, dateEnv, theme, viewApi, rawOptions);
            this.context = context;
            this.selectionConfig = this.buildSelectionConfig(rawOptions); // MUST happen after dateEnv assigned :(
        };
        /*
        will only create a new instance when viewType is changed
        */
        Calendar.prototype.buildViewApi = function (viewType, title, dateProfile, dateEnv) {
            var view = this.view;
            if (!view || view.type !== viewType) {
                view = this.view = { type: viewType };
            }
            view.title = title;
            view.activeStart = dateEnv.toDate(dateProfile.activeRange.start);
            view.activeEnd = dateEnv.toDate(dateProfile.activeRange.end);
            view.currentStart = dateEnv.toDate(dateProfile.currentRange.start);
            view.currentEnd = dateEnv.toDate(dateProfile.currentRange.end);
            return view;
        };
        Calendar.prototype.getAvailableLocaleCodes = function () {
            return Object.keys(this.availableRawLocales);
        };
        // Trigger
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.hasPublicHandlers = function (name) {
            return this.hasHandlers(name) ||
                this.opt(name); // handler specified in options
        };
        Calendar.prototype.publiclyTrigger = function (name, args) {
            var optHandler = this.opt(name);
            this.triggerWith(name, this, args);
            if (optHandler) {
                return optHandler.apply(this, args);
            }
        };
        // View
        // -----------------------------------------------------------------------------------------------------------------
        // Returns a boolean about whether the view is okay to instantiate at some point
        Calendar.prototype.isValidViewType = function (viewType) {
            return Boolean(this.viewSpecs[viewType]);
        };
        Calendar.prototype.changeView = function (viewType, dateOrRange) {
            var dateMarker = null;
            if (dateOrRange) {
                if (dateOrRange.start && dateOrRange.end) { // a range
                    this.optionsManager.mutate({ visibleRange: dateOrRange }, []); // will not rerender
                    this.onOptionsChange(); // ...but yuck
                }
                else { // a date
                    dateMarker = this.dateEnv.createMarker(dateOrRange); // just like gotoDate
                }
            }
            this.unselect();
            this.dispatch({
                type: 'SET_VIEW_TYPE',
                viewType: viewType,
                dateMarker: dateMarker
            });
        };
        // Forces navigation to a view for the given date.
        // `viewType` can be a specific view name or a generic one like "week" or "day".
        // needs to change
        Calendar.prototype.zoomTo = function (dateMarker, viewType) {
            var spec;
            viewType = viewType || 'day'; // day is default zoom
            spec = this.viewSpecs[viewType] || this.getUnitViewSpec(viewType);
            this.unselect();
            if (spec) {
                this.dispatch({
                    type: 'SET_VIEW_TYPE',
                    viewType: spec.type,
                    dateMarker: dateMarker
                });
            }
            else {
                this.dispatch({
                    type: 'SET_DATE',
                    dateMarker: dateMarker
                });
            }
        };
        // Given a duration singular unit, like "week" or "day", finds a matching view spec.
        // Preference is given to views that have corresponding buttons.
        Calendar.prototype.getUnitViewSpec = function (unit) {
            var viewTypes = [].concat(this.context.viewsWithButtons);
            var i;
            var spec;
            for (var viewType in this.viewSpecs) {
                viewTypes.push(viewType);
            }
            for (i = 0; i < viewTypes.length; i++) {
                spec = this.viewSpecs[viewTypes[i]];
                if (spec) {
                    if (spec.singleUnit === unit) {
                        return spec;
                    }
                }
            }
        };
        // Current Date
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.getInitialDate = function () {
            var initialDateInput = this.opt('initialDate');
            // compute the initial ambig-timezone date
            if (initialDateInput != null) {
                return this.dateEnv.createMarker(initialDateInput);
            }
            else {
                return this.getNow(); // getNow already returns unzoned
            }
        };
        Calendar.prototype.prev = function () {
            this.unselect();
            this.dispatch({ type: 'PREV' });
        };
        Calendar.prototype.next = function () {
            this.unselect();
            this.dispatch({ type: 'NEXT' });
        };
        Calendar.prototype.prevYear = function () {
            this.unselect();
            this.dispatch({
                type: 'SET_DATE',
                dateMarker: this.dateEnv.addYears(this.state.currentDate, -1)
            });
        };
        Calendar.prototype.nextYear = function () {
            this.unselect();
            this.dispatch({
                type: 'SET_DATE',
                dateMarker: this.dateEnv.addYears(this.state.currentDate, 1)
            });
        };
        Calendar.prototype.today = function () {
            this.unselect();
            this.dispatch({
                type: 'SET_DATE',
                dateMarker: this.getNow()
            });
        };
        Calendar.prototype.gotoDate = function (zonedDateInput) {
            this.unselect();
            this.dispatch({
                type: 'SET_DATE',
                dateMarker: this.dateEnv.createMarker(zonedDateInput)
            });
        };
        Calendar.prototype.incrementDate = function (deltaInput) {
            var delta = createDuration(deltaInput);
            if (delta) { // else, warn about invalid input?
                this.unselect();
                this.dispatch({
                    type: 'SET_DATE',
                    dateMarker: this.dateEnv.add(this.state.currentDate, delta)
                });
            }
        };
        // for external API
        Calendar.prototype.getDate = function () {
            return this.dateEnv.toDate(this.state.currentDate);
        };
        // Date Formatting Utils
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.formatDate = function (d, formatter) {
            var dateEnv = this.dateEnv;
            return dateEnv.format(dateEnv.createMarker(d), createFormatter(formatter));
        };
        // `settings` is for formatter AND isEndExclusive
        Calendar.prototype.formatRange = function (d0, d1, settings) {
            var dateEnv = this.dateEnv;
            return dateEnv.formatRange(dateEnv.createMarker(d0), dateEnv.createMarker(d1), createFormatter(settings, this.opt('defaultRangeSeparator')), settings);
        };
        Calendar.prototype.formatIso = function (d, omitTime) {
            var dateEnv = this.dateEnv;
            return dateEnv.formatIso(dateEnv.createMarker(d), { omitTime: omitTime });
        };
        // Sizing
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.updateSize = function () {
            this.triggerResizeHandlers(true);
            flushToDom();
        };
        Calendar.prototype.triggerResizeHandlers = function (forced) {
            for (var _i = 0, _a = this.resizeHandlers; _i < _a.length; _i++) {
                var handler = _a[_i];
                handler(forced);
            }
        };
        // Component Registration
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.registerInteractiveComponent = function (component, settingsInput) {
            var settings = parseInteractionSettings(component, settingsInput);
            var DEFAULT_INTERACTIONS = [
                EventClicking,
                EventHovering
            ];
            var interactionClasses = DEFAULT_INTERACTIONS.concat(this.pluginSystem.hooks.componentInteractions);
            var interactions = interactionClasses.map(function (interactionClass) {
                return new interactionClass(settings);
            });
            this.interactionsStore[component.uid] = interactions;
            interactionSettingsStore[component.uid] = settings;
        };
        Calendar.prototype.unregisterInteractiveComponent = function (component) {
            for (var _i = 0, _a = this.interactionsStore[component.uid]; _i < _a.length; _i++) {
                var listener = _a[_i];
                listener.destroy();
            }
            delete this.interactionsStore[component.uid];
            delete interactionSettingsStore[component.uid];
        };
        // Date Selection / Event Selection / DayClick
        // -----------------------------------------------------------------------------------------------------------------
        // this public method receives start/end dates in any format, with any timezone
        // NOTE: args were changed from v3
        Calendar.prototype.select = function (dateOrObj, endDate) {
            var selectionInput;
            if (endDate == null) {
                if (dateOrObj.start != null) {
                    selectionInput = dateOrObj;
                }
                else {
                    selectionInput = {
                        start: dateOrObj,
                        end: null
                    };
                }
            }
            else {
                selectionInput = {
                    start: dateOrObj,
                    end: endDate
                };
            }
            var selection = parseDateSpan(selectionInput, this.dateEnv, createDuration({ days: 1 }) // TODO: cache this?
            );
            if (selection) { // throw parse error otherwise?
                this.dispatch({ type: 'SELECT_DATES', selection: selection });
                this.triggerDateSelect(selection);
            }
        };
        // public method
        Calendar.prototype.unselect = function (pev) {
            if (this.state.dateSelection) {
                this.dispatch({ type: 'UNSELECT_DATES' });
                this.triggerDateUnselect(pev);
            }
        };
        Calendar.prototype.triggerDateSelect = function (selection, pev) {
            var arg = __assign(__assign({}, this.buildDateSpanApi(selection)), { jsEvent: pev ? pev.origEvent : null, view: this.view });
            this.publiclyTrigger('select', [arg]);
        };
        Calendar.prototype.triggerDateUnselect = function (pev) {
            this.publiclyTrigger('unselect', [
                {
                    jsEvent: pev ? pev.origEvent : null,
                    view: this.view
                }
            ]);
        };
        // TODO: receive pev?
        Calendar.prototype.triggerDateClick = function (dateSpan, dayEl, view, ev) {
            var arg = __assign(__assign({}, this.buildDatePointApi(dateSpan)), { dayEl: dayEl, jsEvent: ev, // Is this always a mouse event? See #4655
                view: view });
            this.publiclyTrigger('dateClick', [arg]);
        };
        Calendar.prototype.buildDatePointApi = function (dateSpan) {
            var props = {};
            for (var _i = 0, _a = this.pluginSystem.hooks.datePointTransforms; _i < _a.length; _i++) {
                var transform = _a[_i];
                __assign(props, transform(dateSpan, this));
            }
            __assign(props, buildDatePointApi(dateSpan, this.dateEnv));
            return props;
        };
        Calendar.prototype.buildDateSpanApi = function (dateSpan) {
            var props = {};
            for (var _i = 0, _a = this.pluginSystem.hooks.dateSpanTransforms; _i < _a.length; _i++) {
                var transform = _a[_i];
                __assign(props, transform(dateSpan, this));
            }
            __assign(props, buildDateSpanApi(dateSpan, this.dateEnv));
            return props;
        };
        // Date Utils
        // -----------------------------------------------------------------------------------------------------------------
        // Returns a DateMarker for the current date, as defined by the client's computer or from the `now` option
        Calendar.prototype.getNow = function () {
            var now = this.opt('now');
            if (typeof now === 'function') {
                now = now();
            }
            if (now == null) {
                return this.dateEnv.createNowMarker();
            }
            return this.dateEnv.createMarker(now);
        };
        // Event-Date Utilities
        // -----------------------------------------------------------------------------------------------------------------
        // Given an event's allDay status and start date, return what its fallback end date should be.
        // TODO: rename to computeDefaultEventEnd
        Calendar.prototype.getDefaultEventEnd = function (allDay, marker) {
            var end = marker;
            if (allDay) {
                end = startOfDay(end);
                end = this.dateEnv.add(end, this.defaultAllDayEventDuration);
            }
            else {
                end = this.dateEnv.add(end, this.defaultTimedEventDuration);
            }
            return end;
        };
        // Public Events API
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.addEvent = function (eventInput, sourceInput) {
            if (eventInput instanceof EventApi) {
                var def = eventInput._def;
                var instance = eventInput._instance;
                // not already present? don't want to add an old snapshot
                if (!this.state.eventStore.defs[def.defId]) {
                    this.dispatch({
                        type: 'ADD_EVENTS',
                        eventStore: eventTupleToStore({ def: def, instance: instance }) // TODO: better util for two args?
                    });
                }
                return eventInput;
            }
            var sourceId;
            if (sourceInput instanceof EventSourceApi) {
                sourceId = sourceInput.internalEventSource.sourceId;
            }
            else if (sourceInput != null) {
                var sourceApi = this.getEventSourceById(sourceInput); // TODO: use an internal function
                if (!sourceApi) {
                    console.warn('Could not find an event source with ID "' + sourceInput + '"'); // TODO: test
                    return null;
                }
                else {
                    sourceId = sourceApi.internalEventSource.sourceId;
                }
            }
            var tuple = parseEvent(eventInput, sourceId, this);
            if (tuple) {
                this.dispatch({
                    type: 'ADD_EVENTS',
                    eventStore: eventTupleToStore(tuple)
                });
                return new EventApi(this, tuple.def, tuple.def.recurringDef ? null : tuple.instance);
            }
            return null;
        };
        // TODO: optimize
        Calendar.prototype.getEventById = function (id) {
            var _a = this.state.eventStore, defs = _a.defs, instances = _a.instances;
            id = String(id);
            for (var defId in defs) {
                var def = defs[defId];
                if (def.publicId === id) {
                    if (def.recurringDef) {
                        return new EventApi(this, def, null);
                    }
                    else {
                        for (var instanceId in instances) {
                            var instance = instances[instanceId];
                            if (instance.defId === def.defId) {
                                return new EventApi(this, def, instance);
                            }
                        }
                    }
                }
            }
            return null;
        };
        Calendar.prototype.getEvents = function () {
            var _a = this.state.eventStore, defs = _a.defs, instances = _a.instances;
            var eventApis = [];
            for (var id in instances) {
                var instance = instances[id];
                var def = defs[instance.defId];
                eventApis.push(new EventApi(this, def, instance));
            }
            return eventApis;
        };
        Calendar.prototype.removeAllEvents = function () {
            this.dispatch({ type: 'REMOVE_ALL_EVENTS' });
        };
        // Public Event Sources API
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.getEventSources = function () {
            var sourceHash = this.state.eventSources;
            var sourceApis = [];
            for (var internalId in sourceHash) {
                sourceApis.push(new EventSourceApi(this, sourceHash[internalId]));
            }
            return sourceApis;
        };
        Calendar.prototype.getEventSourceById = function (id) {
            var sourceHash = this.state.eventSources;
            id = String(id);
            for (var sourceId in sourceHash) {
                if (sourceHash[sourceId].publicId === id) {
                    return new EventSourceApi(this, sourceHash[sourceId]);
                }
            }
            return null;
        };
        Calendar.prototype.addEventSource = function (sourceInput) {
            if (sourceInput instanceof EventSourceApi) {
                // not already present? don't want to add an old snapshot
                if (!this.state.eventSources[sourceInput.internalEventSource.sourceId]) {
                    this.dispatch({
                        type: 'ADD_EVENT_SOURCES',
                        sources: [sourceInput.internalEventSource]
                    });
                }
                return sourceInput;
            }
            var eventSource = parseEventSource(sourceInput, this);
            if (eventSource) { // TODO: error otherwise?
                this.dispatch({ type: 'ADD_EVENT_SOURCES', sources: [eventSource] });
                return new EventSourceApi(this, eventSource);
            }
            return null;
        };
        Calendar.prototype.removeAllEventSources = function () {
            this.dispatch({ type: 'REMOVE_ALL_EVENT_SOURCES' });
        };
        Calendar.prototype.refetchEvents = function () {
            this.dispatch({ type: 'FETCH_EVENT_SOURCES' });
        };
        // Scroll
        // -----------------------------------------------------------------------------------------------------------------
        Calendar.prototype.scrollToTime = function (timeInput) {
            var time = createDuration(timeInput);
            if (time) {
                this.trigger('scrollRequest', { time: time });
            }
        };
        return Calendar;
    }());
    EmitterMixin.mixInto(Calendar);
    // for memoizers
    // -----------------------------------------------------------------------------------------------------------------
    function buildDateEnv(rawOptions, pluginHooks, availableLocaleData) {
        var locale = buildLocale(rawOptions.locale || availableLocaleData.defaultCode, availableLocaleData.map);
        return new DateEnv({
            calendarSystem: 'gregory',
            timeZone: rawOptions.timeZone,
            namedTimeZoneImpl: pluginHooks.namedTimeZonedImpl,
            locale: locale,
            weekNumberCalculation: rawOptions.weekNumberCalculation,
            firstDay: rawOptions.firstDay,
            weekText: rawOptions.weekText,
            cmdFormatter: pluginHooks.cmdFormatter
        });
    }
    function buildTheme(rawOptions, pluginHooks) {
        var themeClass = pluginHooks.themeClasses[rawOptions.themeSystem] || StandardTheme;
        return new themeClass(rawOptions);
    }
    function buildSelectionConfig(rawOptions) {
        return processScopedUiProps('select', rawOptions, this);
    }
    function buildEventUiSingleBase(rawOptions) {
        if (rawOptions.editable) { // so 'editable' affected events
            rawOptions = __assign(__assign({}, rawOptions), { eventEditable: true });
        }
        return processScopedUiProps('event', rawOptions, this);
    }
    function buildEventUiBySource(eventSources) {
        return mapHash(eventSources, function (eventSource) {
            return eventSource.ui;
        });
    }
    function buildEventUiBases(eventDefs, eventUiSingleBase, eventUiBySource) {
        var eventUiBases = { '': eventUiSingleBase };
        for (var defId in eventDefs) {
            var def = eventDefs[defId];
            if (def.sourceId && eventUiBySource[def.sourceId]) {
                eventUiBases[defId] = eventUiBySource[def.sourceId];
            }
        }
        return eventUiBases;
    }
    // Title and Date Formatting
    // -----------------------------------------------------------------------------------------------------------------
    // Computes what the title at the top of the calendar should be for this view
    function computeTitle(dateProfile, dateEnv, viewOptions) {
        var range;
        // for views that span a large unit of time, show the proper interval, ignoring stray days before and after
        if (/^(year|month)$/.test(dateProfile.currentRangeUnit)) {
            range = dateProfile.currentRange;
        }
        else { // for day units or smaller, use the actual day range
            range = dateProfile.activeRange;
        }
        return dateEnv.formatRange(range.start, range.end, createFormatter(viewOptions.titleFormat || computeTitleFormat(dateProfile), viewOptions.titleRangeSeparator), { isEndExclusive: dateProfile.isRangeAllDay });
    }
    // Generates the format string that should be used to generate the title for the current date range.
    // Attempts to compute the most appropriate format if not explicitly specified with `titleFormat`.
    function computeTitleFormat(dateProfile) {
        var currentRangeUnit = dateProfile.currentRangeUnit;
        if (currentRangeUnit === 'year') {
            return { year: 'numeric' };
        }
        else if (currentRangeUnit === 'month') {
            return { year: 'numeric', month: 'long' }; // like "September 2014"
        }
        else {
            var days = diffWholeDays(dateProfile.currentRange.start, dateProfile.currentRange.end);
            if (days !== null && days > 1) {
                // multi-day range. shorter, like "Sep 9 - 10 2014"
                return { year: 'numeric', month: 'short', day: 'numeric' };
            }
            else {
                // one day. longer, like "September 9 2014"
                return { year: 'numeric', month: 'long', day: 'numeric' };
            }
        }
    }

    /*
    An abstraction for a dragging interaction originating on an event.
    Does higher-level things than PointerDragger, such as possibly:
    - a "mirror" that moves with the pointer
    - a minimum number of pixels or other criteria for a true drag to begin

    subclasses must emit:
    - pointerdown
    - dragstart
    - dragmove
    - pointerup
    - dragend
    */
    var ElementDragging = /** @class */ (function () {
        function ElementDragging(el) {
            this.emitter = new EmitterMixin();
        }
        ElementDragging.prototype.destroy = function () {
        };
        ElementDragging.prototype.setMirrorIsVisible = function (bool) {
            // optional if subclass doesn't want to support a mirror
        };
        ElementDragging.prototype.setMirrorNeedsRevert = function (bool) {
            // optional if subclass doesn't want to support a mirror
        };
        ElementDragging.prototype.setAutoScrollEnabled = function (bool) {
            // optional
        };
        return ElementDragging;
    }());

    // Computes a default column header formatting string if `colFormat` is not explicitly defined
    function computeFallbackHeaderFormat(datesRepDistinctDays, dayCnt) {
        // if more than one week row, or if there are a lot of columns with not much space,
        // put just the day numbers will be in each cell
        if (!datesRepDistinctDays || dayCnt > 10) {
            return { weekday: 'short' }; // "Sat"
        }
        else if (dayCnt > 1) {
            return { weekday: 'short', month: 'numeric', day: 'numeric', omitCommas: true }; // "Sat 11/12"
        }
        else {
            return { weekday: 'long' }; // "Saturday"
        }
    }

    var CLASS_NAME = 'fc-col-header-cell'; // do the cushion too? no
    var TableDateCell = /** @class */ (function (_super) {
        __extends(TableDateCell, _super);
        function TableDateCell() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TableDateCell.prototype.render = function (props, state, context) {
            var dateEnv = context.dateEnv, options = context.options;
            var date = props.date;
            var dayMeta = getDateMeta(date, props.todayRange, null, props.dateProfile);
            var classNames = [CLASS_NAME].concat(getDayClassNames(dayMeta, context.theme));
            var text = dateEnv.format(date, props.dayHeaderFormat);
            // if colCnt is 1, we are already in a day-view and don't need a navlink
            var navLinkData = (options.navLinks && !dayMeta.isDisabled && props.colCnt > 1)
                ? buildNavLinkData(date)
                : null;
            var hookProps = __assign(__assign(__assign({ date: dateEnv.toDate(date), view: context.view }, props.extraHookProps), { text: text }), dayMeta);
            return (h(RenderHook, { name: 'dayHeader', hookProps: hookProps, defaultContent: renderInner }, function (rootElRef, customClassNames, innerElRef, innerContent) { return (h("th", __assign({ ref: rootElRef, className: classNames.concat(customClassNames).join(' '), "data-date": !dayMeta.isDisabled ? formatDayString(date) : undefined, colSpan: props.colSpan }, props.extraDataAttrs), !dayMeta.isDisabled &&
                h("a", { "data-navlink": navLinkData, class: [
                        'fc-col-header-cell-cushion',
                        props.isSticky ? 'fc-sticky' : ''
                    ].join(' '), ref: innerElRef }, innerContent))); }));
        };
        return TableDateCell;
    }(BaseComponent));
    var TableDowCell = /** @class */ (function (_super) {
        __extends(TableDowCell, _super);
        function TableDowCell() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TableDowCell.prototype.render = function (props, state, context) {
            var dow = props.dow;
            var dateEnv = context.dateEnv;
            var date = addDays(new Date(259200000), dow); // start with Sun, 04 Jan 1970 00:00:00 GMT
            var dateMeta = {
                dow: dow,
                isDisabled: false,
                isFuture: false,
                isPast: false,
                isToday: false,
                isOther: false
            };
            var classNames = [CLASS_NAME].concat(getDayClassNames(dateMeta, context.theme), props.extraClassNames || []);
            var text = dateEnv.format(date, props.dayHeaderFormat);
            var hookProps = __assign(__assign(__assign(__assign({ date: date }, dateMeta), { view: context.view }), props.extraHookProps), { text: text });
            return (h(RenderHook, { name: 'dayHeader', hookProps: hookProps, defaultContent: renderInner }, function (rootElRef, customClassNames, innerElRef, innerContent) { return (h("th", __assign({ ref: rootElRef, className: classNames.concat(customClassNames).join(' '), colSpan: props.colSpan }, props.extraDataAttrs),
                h("a", { class: [
                        'fc-col-header-cell-cushion',
                        props.isSticky ? 'fc-sticky' : ''
                    ].join(' '), ref: innerElRef }, innerContent))); }));
        };
        return TableDowCell;
    }(BaseComponent));
    function renderInner(hookProps) {
        return hookProps.text;
    }

    var NowTimer = /** @class */ (function (_super) {
        __extends(NowTimer, _super);
        function NowTimer(props, context) {
            var _this = _super.call(this, props, context) || this;
            _this.initialNowDate = context.calendar.getNow();
            _this.initialNowQueriedMs = new Date().valueOf();
            _this.state = _this.computeTiming().currentState;
            return _this;
        }
        NowTimer.prototype.render = function (props, state) {
            return props.content(state.nowDate, state.todayRange);
        };
        NowTimer.prototype.componentDidMount = function () {
            this.setTimeout();
        };
        NowTimer.prototype.componentDidUpdate = function (prevProps) {
            if (prevProps.unit !== this.props.unit) {
                this.clearTimeout();
                this.setTimeout();
            }
        };
        NowTimer.prototype.componentWillUnmount = function () {
            this.clearTimeout();
        };
        NowTimer.prototype.computeTiming = function () {
            var _a = this, props = _a.props, context = _a.context;
            var unroundedNow = addMs(this.initialNowDate, new Date().valueOf() - this.initialNowQueriedMs);
            var currentUnitStart = context.dateEnv.startOf(unroundedNow, props.unit);
            var nextUnitStart = context.dateEnv.add(currentUnitStart, createDuration(1, props.unit));
            var waitMs = nextUnitStart.valueOf() - unroundedNow.valueOf();
            return {
                currentState: { nowDate: currentUnitStart, todayRange: buildDayRange(currentUnitStart) },
                nextState: { nowDate: nextUnitStart, todayRange: buildDayRange(nextUnitStart) },
                waitMs: waitMs
            };
        };
        NowTimer.prototype.setTimeout = function () {
            var _this = this;
            var _a = this.computeTiming(), nextState = _a.nextState, waitMs = _a.waitMs;
            this.timeoutId = setTimeout(function () {
                _this.setState(nextState, function () {
                    _this.setTimeout();
                });
            }, waitMs);
        };
        NowTimer.prototype.clearTimeout = function () {
            if (this.timeoutId) {
                clearTimeout(this.timeoutId);
            }
        };
        NowTimer.contextType = ComponentContextType;
        return NowTimer;
    }(m));
    function buildDayRange(date) {
        var start = startOfDay(date);
        var end = addDays(start, 1);
        return { start: start, end: end };
    }

    var DayHeader = /** @class */ (function (_super) {
        __extends(DayHeader, _super);
        function DayHeader() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.createDayHeaderFormatter = memoize(createDayHeaderFormatter);
            return _this;
        }
        DayHeader.prototype.render = function (props, state, context) {
            var dates = props.dates, datesRepDistinctDays = props.datesRepDistinctDays;
            var dayHeaderFormat = this.createDayHeaderFormatter(context.options.dayHeaderFormat, datesRepDistinctDays, dates.length);
            return (h(NowTimer, { unit: 'day', content: function (nowDate, todayRange) { return (h("tr", null,
                    props.renderIntro && props.renderIntro(),
                    dates.map(function (date) { return (datesRepDistinctDays ?
                        h(TableDateCell, { key: date.toISOString(), date: date, todayRange: todayRange, dateProfile: props.dateProfile, colCnt: dates.length, dayHeaderFormat: dayHeaderFormat }) :
                        h(TableDowCell, { key: date.getUTCDay(), dow: date.getUTCDay(), dayHeaderFormat: dayHeaderFormat })); }))); } }));
        };
        return DayHeader;
    }(BaseComponent));
    function createDayHeaderFormatter(input, datesRepDistinctDays, dateCnt) {
        return createFormatter(input ||
            computeFallbackHeaderFormat(datesRepDistinctDays, dateCnt));
    }

    var DaySeriesModel = /** @class */ (function () {
        function DaySeriesModel(range, dateProfileGenerator) {
            var date = range.start;
            var end = range.end;
            var indices = [];
            var dates = [];
            var dayIndex = -1;
            while (date < end) { // loop each day from start to end
                if (dateProfileGenerator.isHiddenDay(date)) {
                    indices.push(dayIndex + 0.5); // mark that it's between indices
                }
                else {
                    dayIndex++;
                    indices.push(dayIndex);
                    dates.push(date);
                }
                date = addDays(date, 1);
            }
            this.dates = dates;
            this.indices = indices;
            this.cnt = dates.length;
        }
        DaySeriesModel.prototype.sliceRange = function (range) {
            var firstIndex = this.getDateDayIndex(range.start); // inclusive first index
            var lastIndex = this.getDateDayIndex(addDays(range.end, -1)); // inclusive last index
            var clippedFirstIndex = Math.max(0, firstIndex);
            var clippedLastIndex = Math.min(this.cnt - 1, lastIndex);
            // deal with in-between indices
            clippedFirstIndex = Math.ceil(clippedFirstIndex); // in-between starts round to next cell
            clippedLastIndex = Math.floor(clippedLastIndex); // in-between ends round to prev cell
            if (clippedFirstIndex <= clippedLastIndex) {
                return {
                    firstIndex: clippedFirstIndex,
                    lastIndex: clippedLastIndex,
                    isStart: firstIndex === clippedFirstIndex,
                    isEnd: lastIndex === clippedLastIndex
                };
            }
            else {
                return null;
            }
        };
        // Given a date, returns its chronolocial cell-index from the first cell of the grid.
        // If the date lies between cells (because of hiddenDays), returns a floating-point value between offsets.
        // If before the first offset, returns a negative number.
        // If after the last offset, returns an offset past the last cell offset.
        // Only works for *start* dates of cells. Will not work for exclusive end dates for cells.
        DaySeriesModel.prototype.getDateDayIndex = function (date) {
            var indices = this.indices;
            var dayOffset = Math.floor(diffDays(this.dates[0], date));
            if (dayOffset < 0) {
                return indices[0] - 1;
            }
            else if (dayOffset >= indices.length) {
                return indices[indices.length - 1] + 1;
            }
            else {
                return indices[dayOffset];
            }
        };
        return DaySeriesModel;
    }());

    var DayTableModel = /** @class */ (function () {
        function DayTableModel(daySeries, breakOnWeeks) {
            var dates = daySeries.dates;
            var daysPerRow;
            var firstDay;
            var rowCnt;
            if (breakOnWeeks) {
                // count columns until the day-of-week repeats
                firstDay = dates[0].getUTCDay();
                for (daysPerRow = 1; daysPerRow < dates.length; daysPerRow++) {
                    if (dates[daysPerRow].getUTCDay() === firstDay) {
                        break;
                    }
                }
                rowCnt = Math.ceil(dates.length / daysPerRow);
            }
            else {
                rowCnt = 1;
                daysPerRow = dates.length;
            }
            this.rowCnt = rowCnt;
            this.colCnt = daysPerRow;
            this.daySeries = daySeries;
            this.cells = this.buildCells();
            this.headerDates = this.buildHeaderDates();
        }
        DayTableModel.prototype.buildCells = function () {
            var rows = [];
            for (var row = 0; row < this.rowCnt; row++) {
                var cells = [];
                for (var col = 0; col < this.colCnt; col++) {
                    cells.push(this.buildCell(row, col));
                }
                rows.push(cells);
            }
            return rows;
        };
        DayTableModel.prototype.buildCell = function (row, col) {
            var date = this.daySeries.dates[row * this.colCnt + col];
            return {
                key: date.toISOString(),
                date: date
            };
        };
        DayTableModel.prototype.buildHeaderDates = function () {
            var dates = [];
            for (var col = 0; col < this.colCnt; col++) {
                dates.push(this.cells[0][col].date);
            }
            return dates;
        };
        DayTableModel.prototype.sliceRange = function (range) {
            var colCnt = this.colCnt;
            var seriesSeg = this.daySeries.sliceRange(range);
            var segs = [];
            if (seriesSeg) {
                var firstIndex = seriesSeg.firstIndex, lastIndex = seriesSeg.lastIndex;
                var index = firstIndex;
                while (index <= lastIndex) {
                    var row = Math.floor(index / colCnt);
                    var nextIndex = Math.min((row + 1) * colCnt, lastIndex + 1);
                    segs.push({
                        row: row,
                        firstCol: index % colCnt,
                        lastCol: (nextIndex - 1) % colCnt,
                        isStart: seriesSeg.isStart && index === firstIndex,
                        isEnd: seriesSeg.isEnd && (nextIndex - 1) === lastIndex
                    });
                    index = nextIndex;
                }
            }
            return segs;
        };
        return DayTableModel;
    }());

    var Slicer = /** @class */ (function () {
        function Slicer() {
            this.sliceBusinessHours = memoize(this._sliceBusinessHours);
            this.sliceDateSelection = memoize(this._sliceDateSpan);
            this.sliceEventStore = memoize(this._sliceEventStore);
            this.sliceEventDrag = memoize(this._sliceInteraction);
            this.sliceEventResize = memoize(this._sliceInteraction);
            this.forceDayIfListItem = false; // hack
        }
        Slicer.prototype.sliceProps = function (props, dateProfile, nextDayThreshold, calendar) {
            var extraArgs = [];
            for (var _i = 4; _i < arguments.length; _i++) {
                extraArgs[_i - 4] = arguments[_i];
            }
            var eventUiBases = props.eventUiBases;
            var eventSegs = this.sliceEventStore.apply(this, __spreadArrays([props.eventStore, eventUiBases, dateProfile, nextDayThreshold], extraArgs));
            return {
                dateSelectionSegs: this.sliceDateSelection.apply(this, __spreadArrays([props.dateSelection, eventUiBases, calendar], extraArgs)),
                businessHourSegs: this.sliceBusinessHours.apply(this, __spreadArrays([props.businessHours, dateProfile, nextDayThreshold, calendar], extraArgs)),
                fgEventSegs: eventSegs.fg,
                bgEventSegs: eventSegs.bg,
                eventDrag: this.sliceEventDrag.apply(this, __spreadArrays([props.eventDrag, eventUiBases, dateProfile, nextDayThreshold], extraArgs)),
                eventResize: this.sliceEventResize.apply(this, __spreadArrays([props.eventResize, eventUiBases, dateProfile, nextDayThreshold], extraArgs)),
                eventSelection: props.eventSelection
            }; // TODO: give interactionSegs?
        };
        Slicer.prototype.sliceNowDate = function (// does not memoize
        date, calendar) {
            var extraArgs = [];
            for (var _i = 2; _i < arguments.length; _i++) {
                extraArgs[_i - 2] = arguments[_i];
            }
            return this._sliceDateSpan.apply(this, __spreadArrays([{ range: { start: date, end: addMs(date, 1) }, allDay: false },
                {},
                calendar], extraArgs));
        };
        Slicer.prototype._sliceBusinessHours = function (businessHours, dateProfile, nextDayThreshold, calendar) {
            var extraArgs = [];
            for (var _i = 4; _i < arguments.length; _i++) {
                extraArgs[_i - 4] = arguments[_i];
            }
            if (!businessHours) {
                return [];
            }
            return this._sliceEventStore.apply(this, __spreadArrays([expandRecurring(businessHours, computeActiveRange(dateProfile, Boolean(nextDayThreshold)), calendar),
                {},
                dateProfile,
                nextDayThreshold], extraArgs)).bg;
        };
        Slicer.prototype._sliceEventStore = function (eventStore, eventUiBases, dateProfile, nextDayThreshold) {
            var extraArgs = [];
            for (var _i = 4; _i < arguments.length; _i++) {
                extraArgs[_i - 4] = arguments[_i];
            }
            if (eventStore) {
                var rangeRes = sliceEventStore(eventStore, eventUiBases, computeActiveRange(dateProfile, Boolean(nextDayThreshold)), nextDayThreshold);
                return {
                    bg: this.sliceEventRanges(rangeRes.bg, extraArgs),
                    fg: this.sliceEventRanges(rangeRes.fg, extraArgs)
                };
            }
            else {
                return { bg: [], fg: [] };
            }
        };
        Slicer.prototype._sliceInteraction = function (interaction, eventUiBases, dateProfile, nextDayThreshold) {
            var extraArgs = [];
            for (var _i = 4; _i < arguments.length; _i++) {
                extraArgs[_i - 4] = arguments[_i];
            }
            if (!interaction) {
                return null;
            }
            var rangeRes = sliceEventStore(interaction.mutatedEvents, eventUiBases, computeActiveRange(dateProfile, Boolean(nextDayThreshold)), nextDayThreshold);
            return {
                segs: this.sliceEventRanges(rangeRes.fg, extraArgs),
                affectedInstances: interaction.affectedEvents.instances,
                isEvent: interaction.isEvent
            };
        };
        Slicer.prototype._sliceDateSpan = function (dateSpan, eventUiBases, calendar) {
            var extraArgs = [];
            for (var _i = 3; _i < arguments.length; _i++) {
                extraArgs[_i - 3] = arguments[_i];
            }
            if (!dateSpan) {
                return [];
            }
            var eventRange = fabricateEventRange(dateSpan, eventUiBases, calendar);
            var segs = this.sliceRange.apply(this, __spreadArrays([dateSpan.range], extraArgs));
            for (var _a = 0, segs_1 = segs; _a < segs_1.length; _a++) {
                var seg = segs_1[_a];
                seg.eventRange = eventRange;
            }
            return segs;
        };
        /*
        "complete" seg means it has component and eventRange
        */
        Slicer.prototype.sliceEventRanges = function (eventRanges, extraArgs) {
            var segs = [];
            for (var _i = 0, eventRanges_1 = eventRanges; _i < eventRanges_1.length; _i++) {
                var eventRange = eventRanges_1[_i];
                segs.push.apply(segs, this.sliceEventRange(eventRange, extraArgs));
            }
            return segs;
        };
        /*
        "complete" seg means it has component and eventRange
        */
        Slicer.prototype.sliceEventRange = function (eventRange, extraArgs) {
            var dateRange = eventRange.range;
            // hack to make multi-day events that are being force-displayed as list-items to take up only one day
            if (this.forceDayIfListItem && eventRange.ui.display === 'list-item') {
                dateRange = {
                    start: dateRange.start,
                    end: addDays(dateRange.start, 1)
                };
            }
            var segs = this.sliceRange.apply(this, __spreadArrays([dateRange], extraArgs));
            for (var _i = 0, segs_2 = segs; _i < segs_2.length; _i++) {
                var seg = segs_2[_i];
                seg.eventRange = eventRange;
                seg.isStart = eventRange.isStart && seg.isStart;
                seg.isEnd = eventRange.isEnd && seg.isEnd;
            }
            return segs;
        };
        return Slicer;
    }());
    /*
    for incorporating slotMinTime/slotMaxTime if appropriate
    TODO: should be part of DateProfile!
    TimelineDateProfile already does this btw
    */
    function computeActiveRange(dateProfile, isComponentAllDay) {
        var range = dateProfile.activeRange;
        if (isComponentAllDay) {
            return range;
        }
        return {
            start: addMs(range.start, dateProfile.slotMinTime.milliseconds),
            end: addMs(range.end, dateProfile.slotMaxTime.milliseconds - 864e5) // 864e5 = ms in a day
        };
    }

    var VISIBLE_HIDDEN_RE = /^(visible|hidden)$/;
    var Scroller = /** @class */ (function (_super) {
        __extends(Scroller, _super);
        function Scroller() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.handleEl = function (el) {
                _this.el = el;
                setRef(_this.props.elRef, el);
            };
            return _this;
        }
        Scroller.prototype.render = function (props) {
            var className = ['fc-scroller'];
            var liquid = props.liquid, liquidIsAbsolute = props.liquidIsAbsolute;
            var isAbsolute = liquid && liquidIsAbsolute;
            if (liquid) {
                if (liquidIsAbsolute) {
                    className.push('fc-scroller-liquid-absolute');
                }
                else {
                    className.push('fc-scroller-liquid');
                }
            }
            return (h("div", { ref: this.handleEl, class: className.join(' '), style: {
                    overflowX: props.overflowX,
                    overflowY: props.overflowY,
                    left: (isAbsolute && -(props.overcomeLeft || 0)) || '',
                    right: (isAbsolute && -(props.overcomeRight || 0)) || '',
                    bottom: (isAbsolute && -(props.overcomeBottom || 0)) || '',
                    marginLeft: (!isAbsolute && -(props.overcomeLeft || 0)) || '',
                    marginRight: (!isAbsolute && -(props.overcomeRight || 0)) || '',
                    marginBottom: (!isAbsolute && -(props.overcomeBottom || 0)) || '',
                    maxHeight: props.maxHeight || ''
                } }, props.children));
        };
        Scroller.prototype.needsXScrolling = function () {
            if (VISIBLE_HIDDEN_RE.test(this.props.overflowX)) {
                return false;
            }
            // testing scrollWidth>clientWidth is unreliable cross-browser when pixel heights aren't integers.
            // much more reliable to see if children are taller than the scroller, even tho doesn't account for
            // inner-child margins and absolute positioning
            var el = this.el;
            var realClientWidth = this.el.getBoundingClientRect().width - this.getYScrollbarWidth();
            var children = el.children;
            for (var i = 0; i < children.length; i++) {
                var childEl = children[i];
                if (childEl.getBoundingClientRect().width > realClientWidth) {
                    return true;
                }
            }
            return false;
        };
        Scroller.prototype.needsYScrolling = function () {
            if (VISIBLE_HIDDEN_RE.test(this.props.overflowY)) {
                return false;
            }
            // testing scrollHeight>clientHeight is unreliable cross-browser when pixel heights aren't integers.
            // much more reliable to see if children are taller than the scroller, even tho doesn't account for
            // inner-child margins and absolute positioning
            var el = this.el;
            var realClientHeight = this.el.getBoundingClientRect().height - this.getXScrollbarWidth();
            var children = el.children;
            for (var i = 0; i < children.length; i++) {
                var childEl = children[i];
                if (childEl.getBoundingClientRect().height > realClientHeight) {
                    return true;
                }
            }
            return false;
        };
        Scroller.prototype.getXScrollbarWidth = function () {
            if (VISIBLE_HIDDEN_RE.test(this.props.overflowX)) {
                return 0;
            }
            else {
                return this.el.offsetHeight - this.el.clientHeight; // only works because we guarantee no borders. TODO: add to CSS with important?
            }
        };
        Scroller.prototype.getYScrollbarWidth = function () {
            if (VISIBLE_HIDDEN_RE.test(this.props.overflowY)) {
                return 0;
            }
            else {
                return this.el.offsetWidth - this.el.clientWidth; // only works because we guarantee no borders. TODO: add to CSS with important?
            }
        };
        return Scroller;
    }(BaseComponent));

    /*
    TODO: somehow infer OtherArgs from masterCallback?
    TODO: infer RefType from masterCallback if provided
    */
    var RefMap = /** @class */ (function () {
        function RefMap(masterCallback) {
            var _this = this;
            this.masterCallback = masterCallback;
            this.currentMap = {};
            this.depths = {};
            this.callbackMap = {};
            this.handleValue = function (val, key) {
                var _a = _this, depths = _a.depths, currentMap = _a.currentMap;
                var removed = false;
                var added = false;
                if (val !== null) {
                    removed = (key in currentMap); // for bug... ACTUALLY: can probably do away with this now that callers don't share numeric indices anymore
                    currentMap[key] = val;
                    depths[key] = (depths[key] || 0) + 1;
                    added = true;
                }
                else if (--depths[key] === 0) {
                    delete currentMap[key];
                    delete _this.callbackMap[key];
                    removed = true;
                }
                if (_this.masterCallback) {
                    if (removed) {
                        _this.masterCallback(null, String(key));
                    }
                    if (added) {
                        _this.masterCallback(val, String(key));
                    }
                }
            };
        }
        RefMap.prototype.createRef = function (key) {
            var _this = this;
            var refCallback = this.callbackMap[key];
            if (!refCallback) {
                refCallback = this.callbackMap[key] = function (val) {
                    _this.handleValue(val, String(key));
                };
            }
            return refCallback;
        };
        // TODO: check callers that don't care about order. should use getAll instead
        // NOTE: this method has become less valuable now that we are encouraged to map order by some other index
        // TODO: provide ONE array-export function, buildArray, which fails on non-numeric indexes. caller can manipulate and "collect"
        RefMap.prototype.collect = function (startIndex, endIndex, step) {
            return collectFromHash(this.currentMap, startIndex, endIndex, step);
        };
        RefMap.prototype.getAll = function () {
            return hashValuesToArray(this.currentMap);
        };
        return RefMap;
    }());

    function computeShrinkWidth(chunkEls) {
        var shrinkCells = findElements(chunkEls, '.fc-scrollgrid-shrink');
        var largestWidth = 0;
        for (var _i = 0, shrinkCells_1 = shrinkCells; _i < shrinkCells_1.length; _i++) {
            var shrinkCell = shrinkCells_1[_i];
            largestWidth = Math.max(largestWidth, computeSmallestCellWidth(shrinkCell));
        }
        return Math.ceil(largestWidth); // <table> elements work best with integers. round up to ensure contents fits
    }
    function getSectionHasLiquidHeight(props, sectionConfig) {
        return props.liquid && sectionConfig.liquid; // does the section do liquid-height? (need to have whole scrollgrid liquid-height as well)
    }
    function getAllowYScrolling(props, sectionConfig) {
        return sectionConfig.maxHeight != null || // if its possible for the height to max out, we might need scrollbars
            getSectionHasLiquidHeight(props, sectionConfig); // if the section is liquid height, it might condense enough to require scrollbars
    }
    // TODO: ONLY use `arg`. force out internal function to use same API
    function renderChunkContent(sectionConfig, chunkConfig, arg) {
        var expandRows = sectionConfig.expandRows;
        var content = typeof chunkConfig.content === 'function' ?
            chunkConfig.content(arg) :
            h('table', {
                className: [
                    chunkConfig.tableClassName,
                    sectionConfig.syncRowHeights ? 'fc-scrollgrid-sync-table' : ''
                ].join(' '),
                style: {
                    minWidth: arg.tableMinWidth,
                    width: arg.clientWidth,
                    height: expandRows ? arg.clientHeight : '' // css `height` on a <table> serves as a min-height
                }
            }, [
                arg.tableColGroupNode,
                h('tbody', {}, typeof chunkConfig.rowContent === 'function' ? chunkConfig.rowContent(arg) : chunkConfig.rowContent)
            ]);
        return content;
    }
    function isColPropsEqual(cols0, cols1) {
        return isArraysEqual(cols0, cols1, isPropsEqual);
    }
    function renderMicroColGroup(cols, shrinkWidth) {
        var colNodes = [];
        /*
        for ColProps with spans, it would have been great to make a single <col span="">
        HOWEVER, Chrome was getting messing up distributing the width to <td>/<th> elements with colspans.
        SOLUTION: making individual <col> elements makes Chrome behave.
        */
        for (var _i = 0, cols_1 = cols; _i < cols_1.length; _i++) {
            var colProps = cols_1[_i];
            var span = colProps.span || 1;
            for (var i = 0; i < span; i++) {
                colNodes.push(h("col", { style: {
                        width: colProps.width === 'shrink' ? sanitizeShrinkWidth(shrinkWidth) : (colProps.width || ''),
                        minWidth: colProps.minWidth || ''
                    } }));
            }
        }
        return (h("colgroup", null, colNodes));
    }
    function sanitizeShrinkWidth(shrinkWidth) {
        /* why 4? if we do 0, it will kill any border, which are needed for computeSmallestCellWidth
        4 accounts for 2 2-pixel borders. TODO: better solution? */
        return shrinkWidth == null ? 4 : shrinkWidth;
    }
    function hasShrinkWidth(cols) {
        for (var _i = 0, cols_2 = cols; _i < cols_2.length; _i++) {
            var col = cols_2[_i];
            if (col.width === 'shrink') {
                return true;
            }
        }
        return false;
    }
    function getScrollGridClassNames(liquid, context) {
        var classNames = [
            'fc-scrollgrid',
            context.theme.getClass('table')
        ];
        if (liquid) {
            classNames.push('fc-scrollgrid-liquid');
        }
        return classNames;
    }
    function getSectionClassNames(sectionConfig, wholeTableVGrow) {
        var classNames = [
            'fc-scrollgrid-section',
            "fc-scrollgrid-section-" + sectionConfig.type,
            sectionConfig.className // used?
        ];
        if (wholeTableVGrow && sectionConfig.liquid && sectionConfig.maxHeight == null) {
            classNames.push('fc-scrollgrid-section-liquid');
        }
        if (sectionConfig.isSticky) {
            classNames.push('fc-scrollgrid-section-sticky');
        }
        return classNames;
    }
    function renderScrollShim(arg) {
        return (h("div", { class: 'fc-scrollgrid-sticky-shim', style: {
                width: arg.clientWidth,
                minWidth: arg.tableMinWidth
            } }));
    }
    function getStickyHeaderDates(options) {
        var stickyHeaderDates = options.stickyHeaderDates;
        if (stickyHeaderDates == null || stickyHeaderDates === 'auto') {
            stickyHeaderDates = options.height === 'auto' || options.viewHeight === 'auto';
        }
        return stickyHeaderDates;
    }
    function getStickyFooterScrollbar(options) {
        var stickyFooterScrollbar = options.stickyFooterScrollbar;
        if (stickyFooterScrollbar == null || stickyFooterScrollbar === 'auto') {
            stickyFooterScrollbar = options.height === 'auto' || options.viewHeight === 'auto';
        }
        return stickyFooterScrollbar;
    }

    var SimpleScrollGrid = /** @class */ (function (_super) {
        __extends(SimpleScrollGrid, _super);
        function SimpleScrollGrid() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.processCols = memoize(function (a) { return a; }, isColPropsEqual); // so we get same `cols` props every time
            _this.renderMicroColGroup = memoize(renderMicroColGroup); // yucky to memoize VNodes, but much more efficient for consumers
            _this.scrollerRefs = new RefMap();
            _this.scrollerElRefs = new RefMap(_this._handleScrollerEl.bind(_this));
            _this.state = {
                shrinkWidth: null,
                forceYScrollbars: false,
                scrollerClientWidths: {},
                scrollerClientHeights: {}
            };
            // TODO: can do a really simple print-view. dont need to join rows
            _this.handleSizing = function () {
                if (!_this.props.forPrint) {
                    _this.setState(__assign({ shrinkWidth: _this.computeShrinkWidth() }, _this.computeScrollerDims()));
                }
            };
            return _this;
        }
        SimpleScrollGrid.prototype.render = function (props, state, context) {
            var _this = this;
            var sectionConfigs = props.sections || [];
            var cols = this.processCols(props.cols);
            var microColGroupNode = props.forPrint ?
                h("colgroup", null) : // temporary
                this.renderMicroColGroup(cols, state.shrinkWidth);
            var classNames = getScrollGridClassNames(props.liquid, context);
            return (h("table", { class: classNames.join(' '), style: { height: props.height } },
                h("tbody", null, sectionConfigs.map(function (sectionConfig, sectionI) { return _this.renderSection(sectionConfig, sectionI, microColGroupNode); }))));
        };
        SimpleScrollGrid.prototype.renderSection = function (sectionConfig, sectionI, microColGroupNode) {
            if ('outerContent' in sectionConfig) {
                return sectionConfig.outerContent;
            }
            return (h("tr", { key: sectionConfig.key, class: getSectionClassNames(sectionConfig, this.props.liquid).join(' ') }, this.renderChunkTd(sectionConfig, sectionI, microColGroupNode, sectionConfig.chunk)));
        };
        SimpleScrollGrid.prototype.renderChunkTd = function (sectionConfig, sectionI, microColGroupNode, chunkConfig) {
            if ('outerContent' in chunkConfig) {
                return chunkConfig.outerContent;
            }
            var props = this.props;
            var _a = this.state, forceYScrollbars = _a.forceYScrollbars, scrollerClientWidths = _a.scrollerClientWidths, scrollerClientHeights = _a.scrollerClientHeights;
            var needsYScrolling = getAllowYScrolling(props, sectionConfig); // TODO: do lazily. do in section config?
            var isLiquid = getSectionHasLiquidHeight(props, sectionConfig);
            // for `!props.liquid` - is WHOLE scrollgrid natural height?
            // TODO: do same thing in advanced scrollgrid? prolly not b/c always has horizontal scrollbars
            var overflowY = !props.liquid ? 'visible' :
                forceYScrollbars ? 'scroll' :
                    !needsYScrolling ? 'hidden' :
                        'auto';
            var content = renderChunkContent(sectionConfig, chunkConfig, {
                tableColGroupNode: microColGroupNode,
                tableMinWidth: '',
                clientWidth: scrollerClientWidths[sectionI] !== undefined ? scrollerClientWidths[sectionI] : null,
                clientHeight: scrollerClientHeights[sectionI] !== undefined ? scrollerClientHeights[sectionI] : null,
                expandRows: sectionConfig.expandRows,
                syncRowHeights: false,
                rowSyncHeights: [],
                reportRowHeightChange: function () { }
            });
            return (h("td", { ref: chunkConfig.elRef },
                h("div", { class: 'fc-scroller-harness' + (isLiquid ? ' fc-scroller-harness-liquid' : '') },
                    h(Scroller, { ref: this.scrollerRefs.createRef(sectionI), elRef: this.scrollerElRefs.createRef(sectionI), overflowY: overflowY, overflowX: !props.liquid ? 'visible' : 'hidden' /* natural height? */, maxHeight: sectionConfig.maxHeight, liquid: isLiquid, liquidIsAbsolute: true /* because its within a harness */ }, content))));
        };
        SimpleScrollGrid.prototype._handleScrollerEl = function (scrollerEl, key) {
            var sectionI = parseInt(key, 10);
            var chunkConfig = this.props.sections[sectionI].chunk;
            setRef(chunkConfig.scrollerElRef, scrollerEl);
        };
        SimpleScrollGrid.prototype.componentDidMount = function () {
            this.handleSizing();
            this.context.addResizeHandler(this.handleSizing);
        };
        SimpleScrollGrid.prototype.componentDidUpdate = function () {
            // TODO: need better solution when state contains non-sizing things
            this.handleSizing();
        };
        SimpleScrollGrid.prototype.componentWillUnmount = function () {
            this.context.removeResizeHandler(this.handleSizing);
        };
        SimpleScrollGrid.prototype.computeShrinkWidth = function () {
            return hasShrinkWidth(this.props.cols)
                ? computeShrinkWidth(this.scrollerElRefs.getAll())
                : 0;
        };
        SimpleScrollGrid.prototype.computeScrollerDims = function () {
            var scrollbarWidth = getScrollbarWidths();
            var sectionCnt = this.props.sections.length;
            var _a = this, scrollerRefs = _a.scrollerRefs, scrollerElRefs = _a.scrollerElRefs;
            var forceYScrollbars = false;
            var scrollerClientWidths = {};
            var scrollerClientHeights = {};
            for (var sectionI = 0; sectionI < sectionCnt; sectionI++) { // along edge
                var scroller = scrollerRefs.currentMap[sectionI];
                if (scroller && scroller.needsYScrolling()) {
                    forceYScrollbars = true;
                    break;
                }
            }
            for (var sectionI = 0; sectionI < sectionCnt; sectionI++) { // along edge
                var scrollerEl = scrollerElRefs.currentMap[sectionI];
                if (scrollerEl) {
                    var harnessEl = scrollerEl.parentNode; // TODO: weird way to get this. need harness b/c doesn't include table borders
                    scrollerClientWidths[sectionI] = Math.floor(harnessEl.getBoundingClientRect().width - (forceYScrollbars
                        ? scrollbarWidth.y // use global because scroller might not have scrollbars yet but will need them in future
                        : 0));
                    scrollerClientHeights[sectionI] = Math.floor(harnessEl.getBoundingClientRect().height // never has horizontal scrollbars
                    );
                }
            }
            return { forceYScrollbars: forceYScrollbars, scrollerClientWidths: scrollerClientWidths, scrollerClientHeights: scrollerClientHeights };
        };
        return SimpleScrollGrid;
    }(BaseComponent));
    SimpleScrollGrid.addStateEquality({
        scrollerClientWidths: isPropsEqual,
        scrollerClientHeights: isPropsEqual
    });

    var EventRoot = /** @class */ (function (_super) {
        __extends(EventRoot, _super);
        function EventRoot() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.elRef = y();
            return _this;
        }
        EventRoot.prototype.render = function (props, state, context) {
            var seg = props.seg;
            var eventRange = seg.eventRange;
            var ui = eventRange.ui;
            var hookProps = {
                event: new EventApi(context.calendar, eventRange.def, eventRange.instance),
                view: context.view,
                timeText: props.timeText,
                textColor: ui.textColor,
                backgroundColor: ui.backgroundColor,
                borderColor: ui.borderColor,
                isDraggable: !props.disableDragging && computeSegDraggable(seg, context),
                isStartResizable: !props.disableResizing && computeSegStartResizable(seg, context),
                isEndResizable: !props.disableResizing && computeSegEndResizable(seg),
                isMirror: Boolean(props.isDragging || props.isResizing || props.isDateSelecting),
                isStart: Boolean(seg.isStart),
                isEnd: Boolean(seg.isEnd),
                isPast: Boolean(props.isPast),
                isFuture: Boolean(props.isFuture),
                isToday: Boolean(props.isToday),
                isSelected: Boolean(props.isSelected),
                isDragging: Boolean(props.isDragging),
                isResizing: Boolean(props.isResizing)
            };
            var style = getSkinCss(ui);
            var standardClassNames = getEventClassNames(hookProps).concat(ui.classNames);
            return (h(RenderHook, { name: 'event', hookProps: hookProps, defaultContent: props.defaultContent, elRef: this.elRef }, function (rootElRef, customClassNames, innerElRef, innerContent) { return props.children(rootElRef, standardClassNames.concat(customClassNames), style, innerElRef, innerContent, hookProps); }));
        };
        EventRoot.prototype.componentDidMount = function () {
            setElSeg(this.elRef.current, this.props.seg);
        };
        /*
        need to re-assign seg to the element if seg changes, even if the element is the same
        */
        EventRoot.prototype.componentDidUpdate = function (prevProps) {
            var seg = this.props.seg;
            if (seg !== prevProps.seg) {
                setElSeg(this.elRef.current, seg);
            }
        };
        return EventRoot;
    }(BaseComponent));

    // should not be a purecomponent
    var StandardEvent = /** @class */ (function (_super) {
        __extends(StandardEvent, _super);
        function StandardEvent() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        StandardEvent.prototype.render = function (props, state, context) {
            var options = context.options;
            // TODO: avoid createFormatter, cache!!!
            // SOLUTION: require that props.defaultTimeFormat is a real formatter, a top-level const,
            // which will require that defaultRangeSeparator be part of the DateEnv (possible already?),
            // and have options.eventTimeFormat be preprocessed.
            var timeFormat = createFormatter(options.eventTimeFormat || props.defaultTimeFormat, options.defaultRangeSeparator);
            var timeText = buildSegTimeText(props.seg, timeFormat, context, props.defaultDisplayEventTime, props.defaultDisplayEventEnd);
            return (h(EventRoot, { seg: props.seg, timeText: timeText, disableDragging: props.disableDragging, disableResizing: props.disableResizing, defaultContent: props.defaultContent || renderInnerContent, isDragging: props.isDragging, isResizing: props.isResizing, isDateSelecting: props.isDateSelecting, isSelected: props.isSelected, isPast: props.isPast, isFuture: props.isFuture, isToday: props.isToday }, function (rootElRef, classNames, style, innerElRef, innerContent, hookProps) { return (h("a", __assign({ className: props.extraClassNames.concat(classNames).join(' '), style: style, ref: rootElRef }, getSegAnchorAttrs(props.seg)),
                h("div", { class: 'fc-event-main', ref: innerElRef }, innerContent),
                hookProps.isStartResizable &&
                    h("div", { class: 'fc-event-resizer fc-event-resizer-start' }),
                hookProps.isEndResizable &&
                    h("div", { class: 'fc-event-resizer fc-event-resizer-end' }))); }));
        };
        return StandardEvent;
    }(BaseComponent));
    function renderInnerContent(innerProps) {
        return [
            innerProps.timeText &&
                h("div", { class: 'fc-event-time' }, innerProps.timeText),
            h("div", { class: 'fc-event-title' }, innerProps.event.title || h(d, null, "\u00A0"))
        ];
    }
    function getSegAnchorAttrs(seg) {
        var url = seg.eventRange.def.url;
        return url ? { href: url } : {};
    }

    var NowIndicatorRoot = function (props) { return (h(ComponentContextType.Consumer, null, function (context) {
        var hookProps = {
            isAxis: props.isAxis,
            date: context.dateEnv.toDate(props.date),
            view: context.view
        };
        return (h(RenderHook, { name: 'nowIndicator', hookProps: hookProps }, props.children));
    })); };

    var DAY_NUM_FORMAT = createFormatter({ day: 'numeric' });
    var DayCellRoot = /** @class */ (function (_super) {
        __extends(DayCellRoot, _super);
        function DayCellRoot() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.buildClassNames = buildHookClassNameGenerator('dayCell');
            return _this;
        }
        DayCellRoot.prototype.render = function (props, state, context) {
            var hookPropsOrigin = {
                date: props.date,
                dateProfile: props.dateProfile,
                todayRange: props.todayRange,
                showDayNumber: props.showDayNumber
            };
            var hookProps = __assign(__assign({}, massageHooksProps(hookPropsOrigin, context)), props.extraHookProps);
            var classNames = getDayClassNames(hookProps, context.theme).concat(hookProps.isDisabled
                ? [] // don't use custom classNames if disalbed
                : this.buildClassNames(hookProps, context, null, hookPropsOrigin) // cacheBuster=hookPropsOrigin
            );
            var dataAttrs = hookProps.isDisabled ? {} : {
                'data-date': formatDayString(props.date)
            };
            return (h(MountHook, { name: 'dayCell', hookProps: hookProps, elRef: props.elRef }, function (rootElRef) { return props.children(rootElRef, classNames, dataAttrs, hookProps.isDisabled); }));
        };
        return DayCellRoot;
    }(BaseComponent));
    var DayCellContent = /** @class */ (function (_super) {
        __extends(DayCellContent, _super);
        function DayCellContent() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        DayCellContent.prototype.render = function (props, state, context) {
            var hookPropsOrigin = {
                date: props.date,
                dateProfile: props.dateProfile,
                todayRange: props.todayRange,
                showDayNumber: props.showDayNumber
            };
            var hookProps = __assign(__assign({}, massageHooksProps(hookPropsOrigin, context)), props.extraHookProps);
            return (h(ContentHook, { name: 'dayCell', hookProps: hookProps, defaultContent: props.defaultContent }, props.children));
        };
        return DayCellContent;
    }(BaseComponent));
    function massageHooksProps(input, context) {
        var dateEnv = context.dateEnv;
        var date = input.date;
        var dayMeta = getDateMeta(date, input.todayRange, null, input.dateProfile);
        return __assign(__assign({ date: dateEnv.toDate(date), view: context.view }, dayMeta), { dayNumberText: input.showDayNumber ? dateEnv.format(date, DAY_NUM_FORMAT) : '' });
    }

    function renderFill(fillType) {
        return (h("div", { class: "fc-" + fillType }));
    }
    var BgEvent = function (props) { return (h(EventRoot, { defaultContent: renderInnerContent$1, seg: props.seg /* uselesss i think */, timeText: '' /* weird */, disableDragging: true, disableResizing: true, isDragging: false, isResizing: false, isDateSelecting: false, isSelected: false, isPast: props.isPast, isFuture: props.isFuture, isToday: props.isToday }, function (rootElRef, classNames, style, innerElRef, innerContent) { return (h("div", { ref: rootElRef, className: ['fc-bg-event'].concat(classNames).join(' '), style: style }, innerContent)); })); };
    function renderInnerContent$1(props) {
        var title = props.event.title;
        return title && (h("div", { class: 'fc-event-title' }, props.event.title));
    }

    var WeekNumberRoot = function (props) { return (h(ComponentContextType.Consumer, null, function (context) {
        var date = props.date;
        var format = createFormatter(context.options.weekNumberFormat || props.defaultFormat); // TODO: precompute
        var num = context.dateEnv.computeWeekNumber(date); // TODO: somehow use for formatting as well?
        var text = context.dateEnv.format(date, format);
        var hookProps = { num: num, text: text, date: date };
        return (h(RenderHook, { name: 'weekNumber', hookProps: hookProps, defaultContent: renderInner$1 }, props.children));
    })); };
    function renderInner$1(innerProps) {
        return innerProps.text;
    }

    /*!
    FullCalendar Day Grid Plugin v5.0.0-beta.2
    Docs & License: https://fullcalendar.io/
    (c) 2019 Adam Shaw
    */

    /* An abstract class for the daygrid views, as well as month view. Renders one or more rows of day cells.
    ----------------------------------------------------------------------------------------------------------------------*/
    // It is a manager for a Table subcomponent, which does most of the heavy lifting.
    // It is responsible for managing width/height.
    var TableView = /** @class */ (function (_super) {
        __extends(TableView, _super);
        function TableView() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.headerElRef = y();
            return _this;
        }
        TableView.prototype.renderSimpleLayout = function (headerRowContent, bodyContent) {
            var _a = this, props = _a.props, context = _a.context;
            var sections = [];
            var stickyHeaderDates = getStickyHeaderDates(context.options);
            if (headerRowContent) {
                sections.push({
                    type: 'header',
                    isSticky: stickyHeaderDates,
                    chunk: {
                        elRef: this.headerElRef,
                        tableClassName: 'fc-col-header',
                        rowContent: headerRowContent
                    }
                });
            }
            sections.push({
                type: 'body',
                liquid: true,
                chunk: { content: bodyContent }
            });
            return (h(ViewRoot, { viewSpec: props.viewSpec }, function (rootElRef, classNames) { return (h("div", { ref: rootElRef, class: ['fc-daygrid'].concat(classNames).join(' ') },
                h(SimpleScrollGrid, { liquid: !props.isHeightAuto, forPrint: props.forPrint, cols: [] /* TODO: make optional? */, sections: sections }))); }));
        };
        TableView.prototype.renderHScrollLayout = function (headerRowContent, bodyContent, colCnt, dayMinWidth) {
            var ScrollGrid = this.context.pluginHooks.scrollGridImpl;
            if (!ScrollGrid) {
                throw new Error('No ScrollGrid implementation');
            }
            var _a = this, props = _a.props, context = _a.context;
            var stickyHeaderDates = getStickyHeaderDates(context.options);
            var stickyFooterScrollbar = getStickyFooterScrollbar(context.options);
            var sections = [];
            if (headerRowContent) {
                sections.push({
                    type: 'header',
                    isSticky: stickyHeaderDates,
                    chunks: [{
                            elRef: this.headerElRef,
                            tableClassName: 'fc-col-header',
                            rowContent: headerRowContent
                        }]
                });
            }
            sections.push({
                type: 'body',
                liquid: true,
                chunks: [{
                        content: bodyContent
                    }]
            });
            if (stickyFooterScrollbar) {
                sections.push({
                    type: 'footer',
                    isSticky: true,
                    chunks: [{ content: renderScrollShim }]
                });
            }
            return (h(ViewRoot, { viewSpec: props.viewSpec }, function (rootElRef, classNames) { return (h("div", { ref: rootElRef, class: ['fc-daygrid'].concat(classNames).join(' ') },
                h(ScrollGrid, { liquid: !props.isHeightAuto, forPrint: props.forPrint, colGroups: [{ cols: [{ span: colCnt, minWidth: dayMinWidth }] }], sections: sections }))); }));
        };
        return TableView;
    }(DateComponent));

    function splitSegsByRow(segs, rowCnt) {
        var byRow = [];
        for (var i = 0; i < rowCnt; i++) {
            byRow[i] = [];
        }
        for (var _i = 0, segs_1 = segs; _i < segs_1.length; _i++) {
            var seg = segs_1[_i];
            byRow[seg.row].push(seg);
        }
        return byRow;
    }
    function splitSegsByFirstCol(segs, colCnt) {
        var byCol = [];
        for (var i = 0; i < colCnt; i++) {
            byCol[i] = [];
        }
        for (var _i = 0, segs_2 = segs; _i < segs_2.length; _i++) {
            var seg = segs_2[_i];
            byCol[seg.firstCol].push(seg);
        }
        return byCol;
    }
    function splitInteractionByRow(ui, rowCnt) {
        var byRow = [];
        if (!ui) {
            for (var i = 0; i < rowCnt; i++) {
                byRow[i] = null;
            }
        }
        else {
            for (var i = 0; i < rowCnt; i++) {
                byRow[i] = {
                    affectedInstances: ui.affectedInstances,
                    isEvent: ui.isEvent,
                    segs: []
                };
            }
            for (var _i = 0, _a = ui.segs; _i < _a.length; _i++) {
                var seg = _a[_i];
                byRow[seg.row].segs.push(seg);
            }
        }
        return byRow;
    }

    var DEFAULT_WEEK_NUM_FORMAT = { week: 'narrow' };
    var TableCell = /** @class */ (function (_super) {
        __extends(TableCell, _super);
        function TableCell() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.handleMoreLink = function (ev) {
                var props = _this.props;
                if (props.onMoreClick) {
                    var allSegs = resliceDaySegs(props.allFgSegs, props.date);
                    var hiddenSegs = allSegs.filter(function (seg) { return props.segIsHidden[seg.eventRange.instance.instanceId]; });
                    props.onMoreClick({
                        date: props.date,
                        allSegs: allSegs,
                        hiddenSegs: hiddenSegs,
                        moreCnt: props.moreCnt,
                        dayEl: _this.base,
                        ev: ev
                    });
                }
            };
            return _this;
        }
        TableCell.prototype.render = function (props, state, context) {
            var _this = this;
            var options = context.options;
            var date = props.date;
            return (h(DayCellRoot, { date: date, todayRange: props.todayRange, dateProfile: props.dateProfile, showDayNumber: props.showDayNumber, extraHookProps: props.extraHookProps, elRef: props.elRef }, function (rootElRef, classNames, rootDataAttrs, isDisabled) { return (h("td", __assign({ ref: rootElRef, class: ['fc-daygrid-day'].concat(classNames, props.extraClassNames || []).join(' ') }, rootDataAttrs, props.extraDataAttrs),
                h("div", { class: 'fc-daygrid-day-frame fc-scrollgrid-sync-inner', ref: props.innerElRef /* different from hook system! RENAME */ },
                    props.showWeekNumber &&
                        h(WeekNumberRoot, { date: date, defaultFormat: DEFAULT_WEEK_NUM_FORMAT }, function (rootElRef, classNames, innerElRef, innerContent) { return (h("a", { ref: rootElRef, class: ['fc-daygrid-week-number'].concat(classNames).join(' '), "data-navlink": options.navLinks ? buildNavLinkData(date, 'week') : null }, innerContent)); }),
                    !isDisabled &&
                        h(TableCellTop, { date: date, showDayNumber: props.showDayNumber, dateProfile: props.dateProfile, todayRange: props.todayRange, extraHookProps: props.extraHookProps }),
                    h("div", { class: 'fc-daygrid-day-events', ref: props.fgContentElRef, style: { paddingBottom: props.fgPaddingBottom } },
                        props.fgContent,
                        Boolean(props.moreCnt) &&
                            h("div", { class: 'fc-daygrid-day-bottom', style: { marginTop: props.moreMarginTop } },
                                h(RenderHook, { name: 'moreLink', hookProps: { num: props.moreCnt, text: props.buildMoreLinkText(props.moreCnt), view: context.view }, defaultContent: renderMoreLinkInner }, function (rootElRef, classNames, innerElRef, innerContent) { return (h("a", { onClick: _this.handleMoreLink, ref: rootElRef, className: ['fc-daygrid-more-link'].concat(classNames).join(' ') }, innerContent)); }))),
                    h("div", { class: 'fc-daygrid-day-bg' }, props.bgContent)))); }));
        };
        return TableCell;
    }(DateComponent));
    function renderTopInner(props) {
        return props.dayNumberText;
    }
    function renderMoreLinkInner(props) {
        return props.text;
    }
    // Given the events within an array of segment objects, reslice them to be in a single day
    function resliceDaySegs(segs, dayDate) {
        var dayStart = dayDate;
        var dayEnd = addDays(dayStart, 1);
        var dayRange = { start: dayStart, end: dayEnd };
        var newSegs = [];
        for (var _i = 0, segs_1 = segs; _i < segs_1.length; _i++) {
            var seg = segs_1[_i];
            var eventRange = seg.eventRange;
            var origRange = eventRange.range;
            var slicedRange = intersectRanges(origRange, dayRange);
            if (slicedRange) {
                newSegs.push(__assign(__assign({}, seg), { eventRange: {
                        def: eventRange.def,
                        ui: __assign(__assign({}, eventRange.ui), { durationEditable: false }),
                        instance: eventRange.instance,
                        range: slicedRange
                    }, isStart: seg.isStart && slicedRange.start.valueOf() === origRange.start.valueOf(), isEnd: seg.isEnd && slicedRange.end.valueOf() === origRange.end.valueOf() }));
            }
        }
        return newSegs;
    }
    var TableCellTop = /** @class */ (function (_super) {
        __extends(TableCellTop, _super);
        function TableCellTop() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TableCellTop.prototype.render = function (props) {
            var _this = this;
            return (h(DayCellContent, { date: props.date, todayRange: props.todayRange, dateProfile: props.dateProfile, showDayNumber: props.showDayNumber, extraHookProps: props.extraHookProps, defaultContent: renderTopInner }, function (innerElRef, innerContent) { return (innerContent &&
                h("div", { class: 'fc-daygrid-day-top', ref: innerElRef },
                    h("a", { className: 'fc-daygrid-day-number', "data-navlink": _this.context.options.navLinks ? buildNavLinkData(props.date) : null }, innerContent))); }));
        };
        return TableCellTop;
    }(BaseComponent));

    var DEFAULT_TABLE_EVENT_TIME_FORMAT = {
        hour: 'numeric',
        minute: '2-digit',
        omitZeroMinute: true,
        meridiem: 'narrow'
    };
    function hasListItemDisplay(eventRange) {
        var display = eventRange.ui.display;
        var isAuto = !display || display === 'auto'; // TODO: normalize earlier on
        return display === 'list-item' || (isAuto &&
            !eventRange.def.allDay &&
            diffDays(eventRange.instance.range.start, eventRange.instance.range.end) <= 1 // TODO: use nextDayThreshold
        );
    }

    var TableEvent = /** @class */ (function (_super) {
        __extends(TableEvent, _super);
        function TableEvent() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TableEvent.prototype.render = function (props, state, context) {
            var options = context.options;
            // TODO: avoid createFormatter, cache!!!
            // SOLUTION: require that props.defaultTimeFormat is a real formatter, a top-level const,
            // which will require that defaultRangeSeparator be part of the DateEnv (possible already?),
            // and have options.eventTimeFormat be preprocessed.
            var timeFormat = createFormatter(options.eventTimeFormat || DEFAULT_TABLE_EVENT_TIME_FORMAT, options.defaultRangeSeparator);
            var timeText = buildSegTimeText(props.seg, timeFormat, context, true, props.defaultDisplayEventEnd);
            return (h(EventRoot, { seg: props.seg, timeText: timeText, defaultContent: renderInnerContent$2, isDragging: props.isDragging, isResizing: false, isDateSelecting: false, isSelected: props.isSelected, isPast: props.isPast, isFuture: props.isFuture, isToday: props.isToday }, function (rootElRef, classNames, style, innerElRef, innerContent, innerProps) { return ( // we don't use styles!
            h("a", __assign({ className: ['fc-daygrid-event', 'fc-daygrid-dot-event'].concat(classNames).join(' '), ref: rootElRef, style: { color: innerProps.textColor } }, getSegAnchorAttrs$1(props.seg)), innerContent)); }));
        };
        return TableEvent;
    }(BaseComponent));
    function renderInnerContent$2(innerProps) {
        return [
            h("div", { className: 'fc-daygrid-event-dot', style: { backgroundColor: innerProps.backgroundColor || innerProps.borderColor } }),
            innerProps.timeText &&
                h("div", { class: 'fc-event-time' }, innerProps.timeText),
            h("div", { class: 'fc-event-title' }, innerProps.event.title || h(d, null, "\u00A0"))
        ];
    }
    function getSegAnchorAttrs$1(seg) {
        var url = seg.eventRange.def.url;
        return url ? { href: url } : {};
    }

    var TableBlockEvent = /** @class */ (function (_super) {
        __extends(TableBlockEvent, _super);
        function TableBlockEvent() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TableBlockEvent.prototype.render = function (props) {
            return (h(StandardEvent, __assign({}, props, { extraClassNames: ['fc-daygrid-event', 'fc-daygrid-block-event', 'fc-h-event'], defaultTimeFormat: DEFAULT_TABLE_EVENT_TIME_FORMAT, defaultDisplayEventEnd: props.defaultDisplayEventEnd, disableResizing: !props.seg.eventRange.def.allDay })));
        };
        return TableBlockEvent;
    }(BaseComponent));

    function computeFgSegPlacement(// for one row. TODO: print mode?
    segs, dayMaxEvents, dayMaxEventRows, eventHeights, maxContentHeight, colCnt, eventOrderSpecs) {
        var colPlacements = []; // if event spans multiple cols, its present in each col
        var moreCnts = []; // by-col
        var segIsHidden = {};
        var segTops = {}; // always populated for each seg
        var segMarginTops = {}; // simetimes populated for each seg
        var moreTops = {};
        var paddingBottoms = {}; // for each cell's inner-wrapper div
        var segsByFirstCol;
        var finalSegsByCol = []; // has each seg represented in each col. only if ready to do positioning
        for (var i = 0; i < colCnt; i++) {
            colPlacements.push([]);
            moreCnts.push(0);
            finalSegsByCol.push([]);
        }
        segs = sortEventSegs(segs, eventOrderSpecs);
        // TODO: try all seg placements and choose the topmost! dont quit after first
        // SOLUTION: when placed, insert into colPlacements
        for (var _i = 0, segs_1 = segs; _i < segs_1.length; _i++) {
            var seg = segs_1[_i];
            var instanceId = seg.eventRange.instance.instanceId;
            var eventHeight = eventHeights[instanceId];
            placeSeg(seg, eventHeight || 0);
        }
        // sort. for dayMaxEvents and segTops computation
        for (var _a = 0, colPlacements_1 = colPlacements; _a < colPlacements_1.length; _a++) {
            var placements = colPlacements_1[_a];
            placements.sort(cmpPlacements); // sorts in-place
        }
        if (dayMaxEvents === true || dayMaxEventRows === true) {
            limitByMaxHeight(moreCnts, segIsHidden, colPlacements, maxContentHeight); // populates moreCnts/segIsHidden
        }
        else if (typeof dayMaxEvents === 'number') {
            limitByMaxEvents(moreCnts, segIsHidden, colPlacements, dayMaxEvents); // populates moreCnts/segIsHidden
        }
        else if (typeof dayMaxEventRows === 'number') {
            limitByMaxRows(moreCnts, segIsHidden, colPlacements, dayMaxEventRows); // populates moreCnts/segIsHidden
        }
        // computes segTops/segMarginTops/moreTops/paddingBottoms
        for (var col = 0; col < colCnt; col++) {
            var placements = colPlacements[col];
            var currentBottom = 0;
            var currentExtraSpace = 0;
            for (var _b = 0, placements_1 = placements; _b < placements_1.length; _b++) {
                var placement = placements_1[_b];
                var seg = placement.seg;
                if (!segIsHidden[seg.eventRange.instance.instanceId]) {
                    segTops[seg.eventRange.instance.instanceId] = placement.top; // from top of container
                    if (seg.firstCol === seg.lastCol && seg.isStart && seg.isEnd) { // TODO: simpler way? NOT DRY
                        segMarginTops[seg.eventRange.instance.instanceId] =
                            placement.top - currentBottom // from previous seg bottom
                                + currentExtraSpace;
                        currentExtraSpace = 0;
                    }
                    else { // multi-col event, abs positioned
                        currentExtraSpace += placement.bottom - placement.top; // for future non-abs segs
                    }
                    currentBottom = placement.bottom;
                }
            }
            if (currentExtraSpace) {
                if (moreCnts[col]) {
                    moreTops[col] = currentExtraSpace;
                }
                else {
                    paddingBottoms[col] = currentExtraSpace;
                }
            }
        }
        segsByFirstCol = colPlacements.map(extractFirstColSegs); // operates on the sorted cols
        finalSegsByCol = colPlacements.map(extractAllColSegs);
        function placeSeg(seg, segHeight) {
            if (!tryPlaceSegAt(seg, segHeight, 0)) {
                for (var col = seg.firstCol; col <= seg.lastCol; col++) {
                    for (var _i = 0, _a = colPlacements[col]; _i < _a.length; _i++) { // will repeat multi-day segs!!!!!!! bad!!!!!!
                        var placement = _a[_i];
                        if (tryPlaceSegAt(seg, segHeight, placement.bottom)) {
                            return;
                        }
                    }
                }
            }
        }
        function tryPlaceSegAt(seg, segHeight, top) {
            if (canPlaceSegAt(seg, segHeight, top)) {
                for (var col = seg.firstCol; col <= seg.lastCol; col++) {
                    colPlacements[col].push({
                        seg: seg,
                        top: top,
                        bottom: top + segHeight
                    });
                }
                return true;
            }
            else {
                return false;
            }
        }
        function canPlaceSegAt(seg, segHeight, top) {
            for (var col = seg.firstCol; col <= seg.lastCol; col++) {
                for (var _i = 0, _a = colPlacements[col]; _i < _a.length; _i++) {
                    var placement = _a[_i];
                    if (top < placement.bottom && top + segHeight > placement.top) { // collide?
                        return false;
                    }
                }
            }
            return true;
        }
        for (var instanceId in eventHeights) {
            if (!eventHeights[instanceId]) {
                segIsHidden[instanceId] = true;
            }
        }
        return {
            finalSegsByCol: finalSegsByCol,
            segsByFirstCol: segsByFirstCol,
            segIsHidden: segIsHidden,
            segTops: segTops,
            segMarginTops: segMarginTops,
            moreCnts: moreCnts,
            moreTops: moreTops,
            paddingBottoms: paddingBottoms
        };
    }
    function extractFirstColSegs(oneColPlacements, col) {
        var segs = [];
        for (var _i = 0, oneColPlacements_1 = oneColPlacements; _i < oneColPlacements_1.length; _i++) {
            var placement = oneColPlacements_1[_i];
            if (placement.seg.firstCol === col) {
                segs.push(placement.seg);
            }
        }
        return segs;
    }
    function extractAllColSegs(oneColPlacements, col) {
        var segs = [];
        for (var _i = 0, oneColPlacements_2 = oneColPlacements; _i < oneColPlacements_2.length; _i++) {
            var placement = oneColPlacements_2[_i];
            segs.push(placement.seg);
        }
        return segs;
    }
    function cmpPlacements(placement0, placement1) {
        return placement0.top - placement1.top;
    }
    function limitByMaxHeight(hiddenCnts, segIsHidden, colPlacements, maxContentHeight) {
        limitEvents(hiddenCnts, segIsHidden, colPlacements, true, function (placement) {
            return placement.bottom <= maxContentHeight;
        });
    }
    function limitByMaxEvents(hiddenCnts, segIsHidden, colPlacements, dayMaxEvents) {
        limitEvents(hiddenCnts, segIsHidden, colPlacements, false, function (placement, levelIndex) {
            return levelIndex < dayMaxEvents;
        });
    }
    function limitByMaxRows(hiddenCnts, segIsHidden, colPlacements, dayMaxEventRows) {
        limitEvents(hiddenCnts, segIsHidden, colPlacements, true, function (placement, levelIndex) {
            return levelIndex < dayMaxEventRows;
        });
    }
    /*
    populates the given hiddenCnts/segIsHidden, which are supplied empty.
    TODO: return them instead
    */
    function limitEvents(hiddenCnts, segIsHidden, colPlacements, moreLinkConsumesLevel, isPlacementInBounds) {
        var colCnt = hiddenCnts.length;
        var segIsVisible = {}; // TODO: instead, use segIsHidden with true/false?
        var visibleColPlacements = []; // will mirror colPlacements
        for (var col = 0; col < colCnt; col++) {
            visibleColPlacements.push([]);
        }
        for (var col = 0; col < colCnt; col++) {
            var placements = colPlacements[col];
            var level = 0;
            for (var _i = 0, placements_2 = placements; _i < placements_2.length; _i++) {
                var placement = placements_2[_i];
                if (isPlacementInBounds(placement, level)) {
                    recordVisible(placement);
                }
                else {
                    recordHidden(placement);
                }
                // only considered a level if the seg had height
                if (placement.top !== placement.bottom) {
                    level++;
                }
            }
        }
        function recordVisible(placement) {
            var seg = placement.seg;
            var instanceId = seg.eventRange.instance.instanceId;
            if (!segIsVisible[instanceId]) {
                segIsVisible[instanceId] = true;
                for (var col = seg.firstCol; col <= seg.lastCol; col++) {
                    visibleColPlacements[col].push(placement);
                }
            }
        }
        function recordHidden(placement) {
            var seg = placement.seg;
            var instanceId = seg.eventRange.instance.instanceId;
            if (!segIsHidden[instanceId]) {
                segIsHidden[instanceId] = true;
                for (var col = seg.firstCol; col <= seg.lastCol; col++) {
                    var hiddenCnt = ++hiddenCnts[col];
                    if (moreLinkConsumesLevel && hiddenCnt === 1) {
                        var lastVisiblePlacement = visibleColPlacements[col].pop();
                        if (lastVisiblePlacement) {
                            recordHidden(lastVisiblePlacement);
                        }
                    }
                }
            }
        }
    }

    var TableRow = /** @class */ (function (_super) {
        __extends(TableRow, _super);
        function TableRow() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.cellElRefs = new RefMap(); // the <td>
            _this.cellInnerElRefs = new RefMap(); // the fc-daygrid-day-frame
            _this.cellContentElRefs = new RefMap(); // the fc-daygrid-day-events
            _this.segHarnessRefs = new RefMap();
            _this.state = {
                cellInnerPositions: null,
                cellContentPositions: null,
                maxContentHeight: null,
                segHeights: {}
            };
            return _this;
        }
        TableRow.prototype.render = function (props, state, context) {
            var _this = this;
            var colCnt = props.cells.length;
            var businessHoursByCol = splitSegsByFirstCol(props.businessHourSegs, colCnt);
            var bgEventSegsByCol = splitSegsByFirstCol(props.bgEventSegs, colCnt);
            var highlightSegsByCol = splitSegsByFirstCol(this.getHighlightSegs(), colCnt);
            var mirrorSegsByCol = splitSegsByFirstCol(this.getMirrorSegs(), colCnt);
            var _a = computeFgSegPlacement(props.fgEventSegs, props.dayMaxEvents, props.dayMaxEventRows, state.segHeights, state.maxContentHeight, colCnt, context.eventOrderSpecs), paddingBottoms = _a.paddingBottoms, finalSegsByCol = _a.finalSegsByCol, segsByFirstCol = _a.segsByFirstCol, segIsHidden = _a.segIsHidden, segTops = _a.segTops, segMarginTops = _a.segMarginTops, moreCnts = _a.moreCnts, moreTops = _a.moreTops;
            var selectedInstanceHash = // TODO: messy way to compute this
             (props.eventDrag && props.eventDrag.affectedInstances) ||
                (props.eventResize && props.eventResize.affectedInstances) ||
                {};
            return (h("tr", null,
                props.renderIntro && props.renderIntro(),
                props.cells.map(function (cell, col) {
                    var normalFgNodes = _this.renderFgSegs(segsByFirstCol[col], segIsHidden, segTops, segMarginTops, selectedInstanceHash, props.todayRange);
                    var mirrorFgNodes = _this.renderFgSegs(mirrorSegsByCol[col], {}, segTops, // use same tops as real rendering
                    {}, {}, props.todayRange, Boolean(props.eventDrag), Boolean(props.eventResize), false // date-selecting (because mirror is never drawn for date selection)
                    );
                    var showWeekNumber = props.showWeekNumbers && col === 0;
                    return (h(TableCell, { key: cell.key, elRef: _this.cellElRefs.createRef(cell.key), innerElRef: _this.cellInnerElRefs.createRef(cell.key) /* FF <td> problem, but okay to use for left/right. TODO: rename prop */, date: cell.date, showDayNumber: props.showDayNumbers || showWeekNumber /* for spacing, we need to force day-numbers if week numbers */, showWeekNumber: showWeekNumber, dateProfile: props.dateProfile, todayRange: props.todayRange, extraHookProps: cell.extraHookProps, extraDataAttrs: cell.extraDataAttrs, extraClassNames: cell.extraClassNames, moreCnt: moreCnts[col], moreMarginTop: moreTops[col] /* rename */, buildMoreLinkText: props.buildMoreLinkText, onMoreClick: props.onMoreClick, hasEvents: Boolean(normalFgNodes.length), allFgSegs: finalSegsByCol[col], segIsHidden: segIsHidden, fgPaddingBottom: paddingBottoms[col], fgContentElRef: _this.cellContentElRefs.createRef(cell.key), fgContent: [
                            h(d, null, normalFgNodes),
                            h(d, null, mirrorFgNodes)
                        ], bgContent: [
                            h(d, null, _this.renderFillSegs(highlightSegsByCol[col], 'highlight')),
                            h(d, null, _this.renderFillSegs(businessHoursByCol[col], 'non-business')),
                            h(d, null, _this.renderFillSegs(bgEventSegsByCol[col], 'bg-event'))
                        ] }));
                })));
        };
        TableRow.prototype.componentDidMount = function () {
            this.updateSizing(true);
        };
        TableRow.prototype.componentDidUpdate = function (prevProps, prevState) {
            var currentProps = this.props;
            this.updateSizing(!isPropsEqual(prevProps, currentProps));
        };
        TableRow.prototype.getHighlightSegs = function () {
            var props = this.props;
            if (props.eventDrag && props.eventDrag.segs.length) { // messy check
                return props.eventDrag.segs;
            }
            else if (props.eventResize && props.eventResize.segs.length) { // messy check
                return props.eventResize.segs;
            }
            else {
                return props.dateSelectionSegs;
            }
        };
        TableRow.prototype.getMirrorSegs = function () {
            var props = this.props;
            if (props.eventResize && props.eventResize.segs.length) { // messy check
                return props.eventResize.segs;
            }
            else {
                return [];
            }
        };
        TableRow.prototype.renderFgSegs = function (segs, segIsHidden, // does NOT mean display:hidden
        segTops, segMarginTops, selectedInstanceHash, todayRange, isDragging, isResizing, isDateSelecting) {
            var context = this.context;
            var eventSelection = this.props.eventSelection;
            var _a = this.state, cellInnerPositions = _a.cellInnerPositions, cellContentPositions = _a.cellContentPositions;
            var defaultDisplayEventEnd = this.props.cells.length === 1; // colCnt === 1
            var nodes = [];
            if (cellInnerPositions && cellContentPositions) {
                for (var _i = 0, segs_1 = segs; _i < segs_1.length; _i++) {
                    var seg = segs_1[_i];
                    var eventRange = seg.eventRange;
                    var instanceId = eventRange.instance.instanceId;
                    var isMirror = isDragging || isResizing || isDateSelecting;
                    var isSelected = selectedInstanceHash[instanceId];
                    var isInvisible = segIsHidden[instanceId] || isSelected;
                    var isAbsolute = segIsHidden[instanceId] || isMirror || seg.firstCol !== seg.lastCol || !seg.isStart || !seg.isEnd; // TODO: simpler way? NOT DRY
                    var marginTop = void 0;
                    var top_1 = void 0;
                    var left = void 0;
                    var right = void 0;
                    if (isAbsolute) {
                        top_1 = segTops[instanceId];
                        // TODO: cache these left/rights so that when vertical coords come around, don't need to recompute?
                        if (context.isRtl) {
                            right = seg.isStart ? 0 : cellContentPositions.rights[seg.firstCol] - cellInnerPositions.rights[seg.firstCol];
                            left = (seg.isEnd ? cellContentPositions.lefts[seg.lastCol] : cellInnerPositions.lefts[seg.lastCol])
                                - cellContentPositions.lefts[seg.firstCol];
                        }
                        else {
                            left = seg.isStart ? 0 : cellInnerPositions.lefts[seg.firstCol] - cellContentPositions.lefts[seg.firstCol];
                            right = cellContentPositions.rights[seg.firstCol]
                                - (seg.isEnd ? cellContentPositions.rights[seg.lastCol] : cellInnerPositions.rights[seg.lastCol]);
                        }
                    }
                    else {
                        marginTop = segMarginTops[instanceId];
                    }
                    nodes.push(h("div", { class: 'fc-daygrid-event-harness' + (isAbsolute ? ' fc-daygrid-event-harness-abs' : ''), key: instanceId, ref: isMirror ? null : this.segHarnessRefs.createRef(instanceId), style: {
                            visibility: isInvisible ? 'hidden' : '',
                            marginTop: marginTop || '',
                            top: top_1 || '',
                            left: left || '',
                            right: right || ''
                        } }, hasListItemDisplay(eventRange) ?
                        h(TableEvent, __assign({ seg: seg, isDragging: isDragging, isSelected: instanceId === eventSelection, defaultDisplayEventEnd: defaultDisplayEventEnd }, getSegMeta(seg, todayRange))) :
                        h(TableBlockEvent, __assign({ seg: seg, isDragging: isDragging, isResizing: isResizing, isDateSelecting: isDateSelecting, isSelected: instanceId === eventSelection, defaultDisplayEventEnd: defaultDisplayEventEnd }, getSegMeta(seg, todayRange)))));
                }
            }
            return nodes;
        };
        TableRow.prototype.renderFillSegs = function (segs, fillType) {
            var isRtl = this.context.isRtl;
            var todayRange = this.props.todayRange;
            var cellInnerPositions = this.state.cellInnerPositions;
            var nodes = [];
            if (cellInnerPositions) {
                for (var _i = 0, segs_2 = segs; _i < segs_2.length; _i++) {
                    var seg = segs_2[_i];
                    var leftRightCss = isRtl ? {
                        right: 0,
                        left: cellInnerPositions.lefts[seg.lastCol] - cellInnerPositions.lefts[seg.firstCol]
                    } : {
                        left: 0,
                        right: cellInnerPositions.rights[seg.firstCol] - cellInnerPositions.rights[seg.lastCol],
                    };
                    // inverse-background events don't have specific instances
                    // TODO: might be a key collision. better solution
                    var eventRange = seg.eventRange;
                    var key = eventRange.instance ? eventRange.instance.instanceId : eventRange.def.defId;
                    nodes.push(h("div", { class: 'fc-daygrid-bg-harness', style: leftRightCss }, fillType === 'bg-event' ?
                        h(BgEvent, __assign({ key: key, seg: seg }, getSegMeta(seg, todayRange))) :
                        renderFill(fillType)));
                }
            }
            return nodes;
        };
        TableRow.prototype.updateSizing = function (isExternalSizingChange) {
            var _a = this, props = _a.props, cellInnerElRefs = _a.cellInnerElRefs, cellContentElRefs = _a.cellContentElRefs;
            if (props.clientWidth !== null) { // positioning ready?
                if (isExternalSizingChange) {
                    var cellInnerEls = props.cells.map(function (cell) { return cellInnerElRefs.currentMap[cell.key]; });
                    var cellContentEls = props.cells.map(function (cell) { return cellContentElRefs.currentMap[cell.key]; });
                    if (cellContentEls.length) {
                        var originEl = this.base; // BAD
                        this.setState({
                            cellInnerPositions: new PositionCache(originEl, cellInnerEls, true, // isHorizontal
                            false),
                            cellContentPositions: new PositionCache(originEl, cellContentEls, true, // isHorizontal (for computeFgSegPlacement)
                            false)
                        });
                    }
                }
                var limitByContentHeight = props.dayMaxEvents === true || props.dayMaxEventRows === true;
                this.setState({
                    segHeights: this.computeSegHeights(),
                    maxContentHeight: limitByContentHeight ? this.computeMaxContentHeight() : null
                });
            }
        };
        TableRow.prototype.computeSegHeights = function () {
            return mapHash(this.segHarnessRefs.currentMap, function (eventHarnessEl, instanceId) { return (eventHarnessEl.getBoundingClientRect().height); });
        };
        TableRow.prototype.computeMaxContentHeight = function () {
            var firstKey = this.props.cells[0].key;
            var cellEl = this.cellElRefs.currentMap[firstKey];
            var eventsEl = this.cellContentElRefs.currentMap[firstKey];
            return cellEl.getBoundingClientRect().bottom - eventsEl.getBoundingClientRect().top;
        };
        TableRow.prototype.getCellEls = function () {
            var elMap = this.cellElRefs.currentMap;
            return this.props.cells.map(function (cell) { return elMap[cell.key]; });
        };
        return TableRow;
    }(DateComponent));
    TableRow.addStateEquality({
        segHeights: isPropsEqual
    });

    var PADDING_FROM_VIEWPORT = 10;
    var SCROLL_DEBOUNCE = 10;
    var Popover = /** @class */ (function (_super) {
        __extends(Popover, _super);
        function Popover() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.repositioner = new DelayedRunner(_this.updateSize.bind(_this));
            _this.handleRootEl = function (el) {
                _this.rootEl = el;
                if (_this.props.elRef) {
                    setRef(_this.props.elRef, el);
                }
            };
            // Triggered when the user clicks *anywhere* in the document, for the autoHide feature
            _this.handleDocumentMousedown = function (ev) {
                var onClose = _this.props.onClose;
                var rootEl = _this.base; // bad
                // only hide the popover if the click happened outside the popover
                if (onClose && !rootEl.contains(ev.target)) {
                    onClose();
                }
            };
            _this.handleDocumentScroll = function () {
                _this.repositioner.request(SCROLL_DEBOUNCE);
            };
            _this.handleCloseClick = function () {
                var onClose = _this.props.onClose;
                if (onClose) {
                    onClose();
                }
            };
            return _this;
        }
        Popover.prototype.render = function (props, state, context) {
            var theme = context.theme;
            var classNames = [
                'fc-popover',
                context.theme.getClass('popover')
            ].concat(props.extraClassNames || []);
            return (h("div", __assign({ class: classNames.join(' ') }, props.extraAttrs, { ref: this.handleRootEl }),
                h("div", { class: 'fc-popover-header ' + theme.getClass('popoverHeader') },
                    h("span", { class: 'fc-popover-title' }, props.title),
                    h("span", { class: 'fc-popover-close ' + theme.getIconClass('close'), onClick: this.handleCloseClick })),
                h("div", { class: 'fc-popover-body ' + theme.getClass('popoverContent') }, props.children)));
        };
        Popover.prototype.componentDidMount = function () {
            document.addEventListener('mousedown', this.handleDocumentMousedown);
            document.addEventListener('scroll', this.handleDocumentScroll);
            this.updateSize();
        };
        Popover.prototype.componentWillUnmount = function () {
            document.removeEventListener('mousedown', this.handleDocumentMousedown);
            document.removeEventListener('scroll', this.handleDocumentScroll);
        };
        // TODO: adjust on window resize
        /*
        NOTE: the popover is position:fixed, so coordinates are relative to the viewport
        NOTE: the PARENT calls this as well, on window resize. we would have wanted to use the repositioner,
              but need to ensure that all other components have updated size first (for alignmentEl)
        */
        Popover.prototype.updateSize = function () {
            var _a = this.props, alignmentEl = _a.alignmentEl, topAlignmentEl = _a.topAlignmentEl;
            var rootEl = this.rootEl;
            if (!rootEl) {
                return; // not sure why this was null, but we shouldn't let external components call updateSize() anyway
            }
            var dims = rootEl.getBoundingClientRect(); // only used for width,height
            var alignment = alignmentEl.getBoundingClientRect();
            var top = topAlignmentEl ? topAlignmentEl.getBoundingClientRect().top : alignment.top;
            top = Math.min(top, window.innerHeight - dims.height - PADDING_FROM_VIEWPORT);
            top = Math.max(top, PADDING_FROM_VIEWPORT);
            var left;
            if (this.context.isRtl) {
                left = alignment.right - dims.width;
            }
            else {
                left = alignment.left;
            }
            left = Math.min(left, window.innerWidth - dims.width - PADDING_FROM_VIEWPORT);
            left = Math.max(left, PADDING_FROM_VIEWPORT);
            applyStyle(rootEl, { top: top, left: left });
        };
        return Popover;
    }(BaseComponent));

    var MorePopover = /** @class */ (function (_super) {
        __extends(MorePopover, _super);
        function MorePopover() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.handlePopoverEl = function (popoverEl) {
                _this.popoverEl = popoverEl;
                if (popoverEl) {
                    _this.context.calendar.registerInteractiveComponent(_this, {
                        el: popoverEl,
                        useEventCenter: false
                    });
                }
                else {
                    _this.context.calendar.unregisterInteractiveComponent(_this);
                }
            };
            return _this;
        }
        MorePopover.prototype.render = function (props, state, context) {
            var options = context.options, dateEnv = context.dateEnv;
            var date = props.date, hiddenInstances = props.hiddenInstances, todayRange = props.todayRange;
            var title = dateEnv.format(date, createFormatter(options.dayPopoverFormat)); // TODO: cache formatter
            return (h(DayCellRoot, { date: date, todayRange: todayRange, elRef: this.handlePopoverEl }, function (rootElRef, dayClassNames, dataAttrs) { return (h(Popover, { elRef: rootElRef, title: title, extraClassNames: ['fc-more-popover'].concat(dayClassNames), extraAttrs: dataAttrs, onClose: props.onCloseClick, alignmentEl: props.alignmentEl, topAlignmentEl: props.topAlignmentEl },
                h(DayCellContent, { date: date, todayRange: todayRange }, function (innerElRef, innerContent) { return (innerContent &&
                    h("div", { class: 'fc-more-popover-misc', ref: innerElRef }, innerContent)); }),
                props.segs.map(function (seg) {
                    var eventRange = seg.eventRange;
                    var instanceId = eventRange.instance.instanceId;
                    return (h("div", { className: 'fc-daygrid-event-harness', key: instanceId, style: {
                            visibility: hiddenInstances[instanceId] ? 'hidden' : ''
                        } }, hasListItemDisplay(eventRange) ?
                        h(TableEvent, __assign({ seg: seg, isDragging: false, isSelected: instanceId === props.selectedInstanceId, defaultDisplayEventEnd: false }, getSegMeta(seg, todayRange))) :
                        h(TableBlockEvent, __assign({ seg: seg, isDragging: false, isResizing: false, isDateSelecting: false, isSelected: instanceId === props.selectedInstanceId, defaultDisplayEventEnd: false }, getSegMeta(seg, todayRange)))));
                }))); }));
        };
        MorePopover.prototype.queryHit = function (positionLeft, positionTop, elWidth, elHeight) {
            var date = this.props.date;
            if (positionLeft < elWidth && positionTop < elHeight) {
                return {
                    component: this,
                    dateSpan: {
                        allDay: true,
                        range: { start: date, end: addDays(date, 1) }
                    },
                    dayEl: this.popoverEl,
                    rect: {
                        left: 0,
                        top: 0,
                        right: elWidth,
                        bottom: elHeight
                    },
                    layer: 1
                };
            }
        };
        MorePopover.prototype.isPopover = function () {
            return true; // gross
        };
        return MorePopover;
    }(DateComponent));

    var Table = /** @class */ (function (_super) {
        __extends(Table, _super);
        function Table() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.splitBusinessHourSegs = memoize(splitSegsByRow);
            _this.splitBgEventSegs = memoize(splitSegsByRow);
            _this.splitFgEventSegs = memoize(splitSegsByRow);
            _this.splitDateSelectionSegs = memoize(splitSegsByRow);
            _this.splitEventDrag = memoize(splitInteractionByRow);
            _this.splitEventResize = memoize(splitInteractionByRow);
            _this.buildBuildMoreLinkText = memoize(buildBuildMoreLinkText);
            _this.rowRefs = new RefMap();
            _this.handleRootEl = function (rootEl) {
                _this.rootEl = rootEl;
                setRef(_this.props.elRef, rootEl);
            };
            _this.handleMoreLinkClick = function (arg) {
                var _a = _this.context, calendar = _a.calendar, view = _a.view, options = _a.options, dateEnv = _a.dateEnv;
                var clickOption = options.moreLinkClick;
                function segForPublic(seg) {
                    var _a = seg.eventRange, def = _a.def, instance = _a.instance, range = _a.range;
                    return {
                        event: new EventApi(calendar, def, instance),
                        start: dateEnv.toDate(range.start),
                        end: dateEnv.toDate(range.end),
                        isStart: seg.isStart,
                        isEnd: seg.isEnd
                    };
                }
                if (typeof clickOption === 'function') {
                    // the returned value can be an atomic option
                    // TODO: weird how we don't use the `clickOption`
                    clickOption = calendar.publiclyTrigger('moreLinkClick', [
                        {
                            date: dateEnv.toDate(arg.date),
                            allDay: true,
                            allSegs: arg.allSegs.map(segForPublic),
                            hiddenSegs: arg.hiddenSegs.map(segForPublic),
                            jsEvent: arg.ev,
                            view: view
                        }
                    ]);
                }
                if (clickOption === 'popover') {
                    _this.setState({
                        morePopoverState: __assign(__assign({}, arg), { currentFgEventSegs: _this.props.fgEventSegs })
                    });
                }
                else if (typeof clickOption === 'string') { // a view name
                    calendar.zoomTo(arg.date, clickOption);
                }
            };
            _this.handleMorePopoverClose = function () {
                _this.setState({
                    morePopoverState: null
                });
            };
            return _this;
        }
        Table.prototype.render = function (props, state, context) {
            var _this = this;
            var dayMaxEventRows = props.dayMaxEventRows, dayMaxEvents = props.dayMaxEvents, expandRows = props.expandRows;
            var morePopoverState = state.morePopoverState;
            var rowCnt = props.cells.length;
            var businessHourSegsByRow = this.splitBusinessHourSegs(props.businessHourSegs, rowCnt);
            var bgEventSegsByRow = this.splitBgEventSegs(props.bgEventSegs, rowCnt);
            var fgEventSegsByRow = this.splitFgEventSegs(props.fgEventSegs, rowCnt);
            var dateSelectionSegsByRow = this.splitDateSelectionSegs(props.dateSelectionSegs, rowCnt);
            var eventDragByRow = this.splitEventDrag(props.eventDrag, rowCnt);
            var eventResizeByRow = this.splitEventResize(props.eventResize, rowCnt);
            var buildMoreLinkText = this.buildBuildMoreLinkText(context.options.moreLinkText);
            var limitViaBalanced = dayMaxEvents === true || dayMaxEventRows === true;
            // if rows can't expand to fill fixed height, can't do balanced-height event limit
            // TODO: best place to normalize these options?
            if (limitViaBalanced && !expandRows) {
                limitViaBalanced = false;
                dayMaxEventRows = null;
                dayMaxEvents = null;
            }
            var classNames = [
                'fc-daygrid-body',
                limitViaBalanced ? 'fc-daygrid-body-balanced' : 'fc-daygrid-body-unbalanced',
                expandRows ? '' : 'fc-daygrid-body-natural' // will height of one row depend on the others?
            ];
            return (h("div", { class: classNames.join(' '), ref: this.handleRootEl, style: {
                    // these props are important to give this wrapper correct dimensions for interactions
                    // TODO: if we set it here, can we avoid giving to inner tables?
                    width: props.clientWidth,
                    minWidth: props.tableMinWidth
                } },
                h(NowTimer, { unit: 'day', content: function (nowDate, todayRange) { return [
                        h("table", { className: 'fc-scrollgrid-sync-table', style: {
                                width: props.clientWidth,
                                minWidth: props.tableMinWidth,
                                height: expandRows ? props.clientHeight : ''
                            } },
                            props.colGroupNode,
                            h("tbody", null, props.cells.map(function (cells, row) { return (h(TableRow, { ref: _this.rowRefs.createRef(row), key: cells.length
                                    ? cells[0].date.toISOString() /* best? or put key on cell? or use diff formatter? */
                                    : row // in case there are no cells (like when resource view is loading)
                                , showDayNumbers: rowCnt > 1, showWeekNumbers: props.showWeekNumbers, todayRange: todayRange, dateProfile: props.dateProfile, cells: cells, renderIntro: props.renderRowIntro, businessHourSegs: businessHourSegsByRow[row], eventSelection: props.eventSelection, bgEventSegs: bgEventSegsByRow[row], fgEventSegs: fgEventSegsByRow[row], dateSelectionSegs: dateSelectionSegsByRow[row], eventDrag: eventDragByRow[row], eventResize: eventResizeByRow[row], dayMaxEvents: dayMaxEvents, dayMaxEventRows: dayMaxEventRows, clientWidth: props.clientWidth, buildMoreLinkText: buildMoreLinkText, onMoreClick: _this.handleMoreLinkClick })); }))),
                        (morePopoverState && morePopoverState.currentFgEventSegs === props.fgEventSegs) && // clear popover on event mod
                            h(MorePopover, { date: state.morePopoverState.date, segs: state.morePopoverState.allSegs, alignmentEl: state.morePopoverState.dayEl, topAlignmentEl: rowCnt === 1 ? props.headerAlignElRef.current : null, onCloseClick: _this.handleMorePopoverClose, selectedInstanceId: props.eventSelection, hiddenInstances: // yuck
                                (props.eventDrag ? props.eventDrag.affectedInstances : null) ||
                                    (props.eventResize ? props.eventResize.affectedInstances : null) ||
                                    {}, todayRange: todayRange })
                    ]; } })));
        };
        // Hit System
        // ----------------------------------------------------------------------------------------------------
        Table.prototype.prepareHits = function () {
            this.rowPositions = new PositionCache(this.rootEl, this.rowRefs.collect().map(function (rowObj) { return rowObj.getCellEls()[0]; }), // first cell el in each row. TODO: not optimal
            false, true // vertical
            );
            this.colPositions = new PositionCache(this.rootEl, this.rowRefs.currentMap[0].getCellEls(), // cell els in first row
            true, // horizontal
            false);
        };
        Table.prototype.positionToHit = function (leftPosition, topPosition) {
            var _a = this, colPositions = _a.colPositions, rowPositions = _a.rowPositions;
            var col = colPositions.leftToIndex(leftPosition);
            var row = rowPositions.topToIndex(topPosition);
            if (row != null && col != null) {
                return {
                    row: row,
                    col: col,
                    dateSpan: {
                        range: this.getCellRange(row, col),
                        allDay: true
                    },
                    dayEl: this.getCellEl(row, col),
                    relativeRect: {
                        left: colPositions.lefts[col],
                        right: colPositions.rights[col],
                        top: rowPositions.tops[row],
                        bottom: rowPositions.bottoms[row]
                    }
                };
            }
        };
        Table.prototype.getCellEl = function (row, col) {
            return this.rowRefs.currentMap[row].getCellEls()[col]; // TODO: not optimal
        };
        Table.prototype.getCellRange = function (row, col) {
            var start = this.props.cells[row][col].date;
            var end = addDays(start, 1);
            return { start: start, end: end };
        };
        return Table;
    }(DateComponent));
    function buildBuildMoreLinkText(moreLinkTextInput) {
        if (typeof moreLinkTextInput === 'function') {
            return moreLinkTextInput;
        }
        else {
            return function (num) {
                return "+" + num + " " + moreLinkTextInput;
            };
        }
    }

    var DayTable = /** @class */ (function (_super) {
        __extends(DayTable, _super);
        function DayTable() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.slicer = new DayTableSlicer();
            _this.tableRef = y();
            _this.handleRootEl = function (rootEl) {
                var calendar = _this.context.calendar;
                if (rootEl) {
                    calendar.registerInteractiveComponent(_this, { el: rootEl });
                }
                else {
                    calendar.unregisterInteractiveComponent(_this);
                }
            };
            return _this;
        }
        DayTable.prototype.render = function (props, state, context) {
            var dateProfile = props.dateProfile, dayTableModel = props.dayTableModel;
            return (h(Table, __assign({ ref: this.tableRef, elRef: this.handleRootEl }, this.slicer.sliceProps(props, dateProfile, props.nextDayThreshold, context.calendar, dayTableModel), { cells: dayTableModel.cells, dateProfile: dateProfile, colGroupNode: props.colGroupNode, tableMinWidth: props.tableMinWidth, renderRowIntro: props.renderRowIntro, dayMaxEvents: props.dayMaxEvents, dayMaxEventRows: props.dayMaxEventRows, showWeekNumbers: props.showWeekNumbers, expandRows: props.expandRows, headerAlignElRef: props.headerAlignElRef, clientWidth: props.clientWidth, clientHeight: props.clientHeight })));
        };
        DayTable.prototype.prepareHits = function () {
            this.tableRef.current.prepareHits();
        };
        DayTable.prototype.queryHit = function (positionLeft, positionTop) {
            var rawHit = this.tableRef.current.positionToHit(positionLeft, positionTop);
            if (rawHit) {
                return {
                    component: this,
                    dateSpan: rawHit.dateSpan,
                    dayEl: rawHit.dayEl,
                    rect: {
                        left: rawHit.relativeRect.left,
                        right: rawHit.relativeRect.right,
                        top: rawHit.relativeRect.top,
                        bottom: rawHit.relativeRect.bottom
                    },
                    layer: 0
                };
            }
        };
        return DayTable;
    }(DateComponent));
    var DayTableSlicer = /** @class */ (function (_super) {
        __extends(DayTableSlicer, _super);
        function DayTableSlicer() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.forceDayIfListItem = true;
            return _this;
        }
        DayTableSlicer.prototype.sliceRange = function (dateRange, dayTableModel) {
            return dayTableModel.sliceRange(dateRange);
        };
        return DayTableSlicer;
    }(Slicer));

    var DayTableView = /** @class */ (function (_super) {
        __extends(DayTableView, _super);
        function DayTableView() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.buildDayTableModel = memoize(buildDayTableModel);
            _this.headerRef = y();
            _this.tableRef = y();
            return _this;
        }
        DayTableView.prototype.render = function (props, state, context) {
            var _this = this;
            var options = context.options;
            var dateProfile = props.dateProfile;
            var dayTableModel = this.buildDayTableModel(dateProfile, props.dateProfileGenerator);
            var headerContent = options.dayHeaders &&
                h(DayHeader, { ref: this.headerRef, dateProfile: dateProfile, dates: dayTableModel.headerDates, datesRepDistinctDays: dayTableModel.rowCnt === 1 });
            var bodyContent = function (contentArg) { return (h(DayTable, { ref: _this.tableRef, dateProfile: dateProfile, dayTableModel: dayTableModel, businessHours: props.businessHours, dateSelection: props.dateSelection, eventStore: props.eventStore, eventUiBases: props.eventUiBases, eventSelection: props.eventSelection, eventDrag: props.eventDrag, eventResize: props.eventResize, nextDayThreshold: context.nextDayThreshold, colGroupNode: contentArg.tableColGroupNode, tableMinWidth: contentArg.tableMinWidth, dayMaxEvents: options.dayMaxEvents, dayMaxEventRows: options.dayMaxEventRows, showWeekNumbers: options.weekNumbers, expandRows: !props.isHeightAuto, headerAlignElRef: _this.headerElRef, clientWidth: contentArg.clientWidth, clientHeight: contentArg.clientHeight })); };
            return options.dayMinWidth
                ? this.renderHScrollLayout(headerContent, bodyContent, dayTableModel.colCnt, options.dayMinWidth)
                : this.renderSimpleLayout(headerContent, bodyContent);
        };
        return DayTableView;
    }(TableView));
    function buildDayTableModel(dateProfile, dateProfileGenerator) {
        var daySeries = new DaySeriesModel(dateProfile.renderRange, dateProfileGenerator);
        return new DayTableModel(daySeries, /year|month|week/.test(dateProfile.currentRangeUnit));
    }

    var TableDateProfileGenerator = /** @class */ (function (_super) {
        __extends(TableDateProfileGenerator, _super);
        function TableDateProfileGenerator() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        // Computes the date range that will be rendered.
        TableDateProfileGenerator.prototype.buildRenderRange = function (currentRange, currentRangeUnit, isRangeAllDay) {
            var dateEnv = this.dateEnv;
            var renderRange = _super.prototype.buildRenderRange.call(this, currentRange, currentRangeUnit, isRangeAllDay);
            var start = renderRange.start;
            var end = renderRange.end;
            var endOfWeek;
            // year and month views should be aligned with weeks. this is already done for week
            if (/^(year|month)$/.test(currentRangeUnit)) {
                start = dateEnv.startOfWeek(start);
                // make end-of-week if not already
                endOfWeek = dateEnv.startOfWeek(end);
                if (endOfWeek.valueOf() !== end.valueOf()) {
                    end = addWeeks(endOfWeek, 1);
                }
            }
            // ensure 6 weeks
            if (this.options.monthMode &&
                this.options.fixedWeekCount) {
                var rowCnt = Math.ceil(// could be partial weeks due to hiddenDays
                diffWeeks(start, end));
                end = addWeeks(end, 6 - rowCnt);
            }
            return { start: start, end: end };
        };
        return TableDateProfileGenerator;
    }(DateProfileGenerator));

    var main = createPlugin({
        initialView: 'dayGridMonth',
        views: {
            dayGrid: {
                component: DayTableView,
                dateProfileGeneratorClass: TableDateProfileGenerator
            },
            dayGridDay: {
                type: 'dayGrid',
                duration: { days: 1 }
            },
            dayGridWeek: {
                type: 'dayGrid',
                duration: { weeks: 1 }
            },
            dayGridMonth: {
                type: 'dayGrid',
                duration: { months: 1 },
                monthMode: true,
                fixedWeekCount: true
            }
        }
    });

    /*!
    FullCalendar Time Grid Plugin v5.0.0-beta.2
    Docs & License: https://fullcalendar.io/
    (c) 2019 Adam Shaw
    */

    var AllDaySplitter = /** @class */ (function (_super) {
        __extends(AllDaySplitter, _super);
        function AllDaySplitter() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        AllDaySplitter.prototype.getKeyInfo = function () {
            return {
                allDay: {},
                timed: {}
            };
        };
        AllDaySplitter.prototype.getKeysForDateSpan = function (dateSpan) {
            if (dateSpan.allDay) {
                return ['allDay'];
            }
            else {
                return ['timed'];
            }
        };
        AllDaySplitter.prototype.getKeysForEventDef = function (eventDef) {
            if (!eventDef.allDay) {
                return ['timed'];
            }
            else if (hasBgRendering(eventDef)) {
                return ['timed', 'allDay'];
            }
            else {
                return ['allDay'];
            }
        };
        return AllDaySplitter;
    }(Splitter));

    var TimeColsSlatsCoords = /** @class */ (function () {
        function TimeColsSlatsCoords(positions, dateProfile, slatMetas) {
            this.positions = positions;
            this.dateProfile = dateProfile;
            this.slatMetas = slatMetas;
        }
        TimeColsSlatsCoords.prototype.safeComputeTop = function (date) {
            var dateProfile = this.dateProfile;
            if (rangeContainsMarker(dateProfile.currentRange, date)) {
                var startOfDayDate = startOfDay(date);
                var timeMs = date.valueOf() - startOfDayDate.valueOf();
                if (timeMs >= asRoughMs(dateProfile.slotMinTime) &&
                    timeMs < asRoughMs(dateProfile.slotMaxTime)) {
                    return this.computeTimeTop(createDuration(timeMs));
                }
            }
        };
        // Computes the top coordinate, relative to the bounds of the grid, of the given date.
        // A `startOfDayDate` must be given for avoiding ambiguity over how to treat midnight.
        TimeColsSlatsCoords.prototype.computeDateTop = function (when, startOfDayDate) {
            if (!startOfDayDate) {
                startOfDayDate = startOfDay(when);
            }
            return this.computeTimeTop(createDuration(when.valueOf() - startOfDayDate.valueOf()));
        };
        // Computes the top coordinate, relative to the bounds of the grid, of the given time (a Duration).
        // This is a makeshify way to compute the time-top. Assumes all slatMetas dates are uniform.
        // Eventually allow computation with arbirary slat dates.
        TimeColsSlatsCoords.prototype.computeTimeTop = function (duration) {
            var _a = this, positions = _a.positions, dateProfile = _a.dateProfile, slatMetas = _a.slatMetas;
            var len = positions.els.length;
            var slotDurationMs = slatMetas[1].date.valueOf() - slatMetas[0].date.valueOf(); // we assume dates are uniform
            var slatCoverage = (duration.milliseconds - asRoughMs(dateProfile.slotMinTime)) / slotDurationMs; // floating-point value of # of slots covered
            var slatIndex;
            var slatRemainder;
            // compute a floating-point number for how many slats should be progressed through.
            // from 0 to number of slats (inclusive)
            // constrained because slotMinTime/slotMaxTime might be customized.
            slatCoverage = Math.max(0, slatCoverage);
            slatCoverage = Math.min(len, slatCoverage);
            // an integer index of the furthest whole slat
            // from 0 to number slats (*exclusive*, so len-1)
            slatIndex = Math.floor(slatCoverage);
            slatIndex = Math.min(slatIndex, len - 1);
            // how much further through the slatIndex slat (from 0.0-1.0) must be covered in addition.
            // could be 1.0 if slatCoverage is covering *all* the slots
            slatRemainder = slatCoverage - slatIndex;
            return positions.tops[slatIndex] +
                positions.getHeight(slatIndex) * slatRemainder;
        };
        return TimeColsSlatsCoords;
    }());

    // potential nice values for the slot-duration and interval-duration
    // from largest to smallest
    var STOCK_SUB_DURATIONS = [
        { hours: 1 },
        { minutes: 30 },
        { minutes: 15 },
        { seconds: 30 },
        { seconds: 15 }
    ];
    /*
    for the horizontal "slats" that run width-wise. Has a time axis on a side. Depends on RTL.
    */
    var TimeColsSlats = /** @class */ (function (_super) {
        __extends(TimeColsSlats, _super);
        function TimeColsSlats() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.rootElRef = y();
            _this.slatElRefs = new RefMap();
            return _this;
        }
        TimeColsSlats.prototype.render = function (props, state, context) {
            var theme = context.theme;
            return (h("div", { class: 'fc-timegrid-slots', ref: this.rootElRef },
                h("table", { class: theme.getClass('table'), style: {
                        minWidth: props.tableMinWidth,
                        width: props.clientWidth,
                        height: props.minHeight
                    } },
                    props.tableColGroupNode /* relies on there only being a single <col> for the axis */,
                    h(TimeColsSlatsBody, { slatElRefs: this.slatElRefs, axis: props.axis, slatMetas: props.slatMetas }))));
        };
        TimeColsSlats.prototype.componentDidMount = function () {
            this.updateSizing();
        };
        TimeColsSlats.prototype.componentDidUpdate = function () {
            this.updateSizing();
        };
        TimeColsSlats.prototype.componentWillUnmount = function () {
            if (this.props.onCoords) {
                this.props.onCoords(null);
            }
        };
        TimeColsSlats.prototype.updateSizing = function () {
            var props = this.props;
            if (props.onCoords && props.clientWidth !== null) { // means sizing has stabilized
                props.onCoords(new TimeColsSlatsCoords(new PositionCache(this.rootElRef.current, collectSlatEls(this.slatElRefs.currentMap, props.slatMetas), false, true // vertical
                ), props.dateProfile, props.slatMetas));
            }
        };
        return TimeColsSlats;
    }(BaseComponent));
    function collectSlatEls(elMap, slatMetas) {
        return slatMetas.map(function (slatMeta) { return elMap[slatMeta.key]; });
    }
    var TimeColsSlatsBody = /** @class */ (function (_super) {
        __extends(TimeColsSlatsBody, _super);
        function TimeColsSlatsBody() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TimeColsSlatsBody.prototype.render = function (props, state, context) {
            var slatElRefs = props.slatElRefs;
            return (h("tbody", null, props.slatMetas.map(function (slatMeta, i) {
                var hookProps = {
                    time: slatMeta.time,
                    date: context.dateEnv.toDate(slatMeta.date),
                    view: context.view
                };
                var classNames = [
                    'fc-timegrid-slot',
                    'fc-timegrid-slot-lane',
                    slatMeta.isLabeled ? '' : 'fc-timegrid-slot-minor'
                ];
                return (h("tr", { key: slatMeta.key, ref: slatElRefs.createRef(slatMeta.key) },
                    props.axis &&
                        h(TimeColsAxisCell, __assign({}, slatMeta)),
                    h(RenderHook, { name: 'slotLane', hookProps: hookProps }, function (rootElRef, customClassNames, innerElRef, innerContent) { return (h("td", { ref: rootElRef, className: classNames.concat(customClassNames).join(' '), "data-time": slatMeta.isoTimeStr }, innerContent)); })));
            })));
        };
        return TimeColsSlatsBody;
    }(BaseComponent));
    var DEFAULT_SLAT_LABEL_FORMAT = {
        hour: 'numeric',
        minute: '2-digit',
        omitZeroMinute: true,
        meridiem: 'short'
    };
    function TimeColsAxisCell(props) {
        var classNames = [
            'fc-timegrid-slot',
            'fc-timegrid-slot-label',
            props.isLabeled ? 'fc-scrollgrid-shrink' : 'fc-timegrid-slot-minor'
        ];
        return (h(ComponentContextType.Consumer, null, function (context) {
            if (!props.isLabeled) {
                return (h("td", { className: classNames.join(' '), "data-time": props.isoTimeStr }));
            }
            else {
                var dateEnv = context.dateEnv, options = context.options, view = context.view;
                var labelFormat = createFormatter(options.slotLabelFormat || DEFAULT_SLAT_LABEL_FORMAT); // TODO: optimize!!!
                var hookProps = {
                    time: props.time,
                    date: dateEnv.toDate(props.date),
                    view: view,
                    text: dateEnv.format(props.date, labelFormat)
                };
                return (h(RenderHook, { name: 'slotLabel', hookProps: hookProps, defaultContent: renderInnerContent$3 }, function (rootElRef, customClassNames, innerElRef, innerContent) { return (h("td", { ref: rootElRef, class: classNames.concat(customClassNames).join(' '), "data-time": props.isoTimeStr },
                    h("div", { class: 'fc-timegrid-slot-label-frame fc-scrollgrid-shrink-frame' },
                        h("span", { className: 'fc-timegrid-slot-label-cushion fc-scrollgrid-shrink-cushion', ref: innerElRef }, innerContent)))); }));
            }
        }));
    }
    function renderInnerContent$3(props) {
        return props.text;
    }
    function buildSlatMetas(slotMinTime, slotMaxTime, labelIntervalInput, slotDuration, dateEnv) {
        var dayStart = new Date(0);
        var slatTime = slotMinTime;
        var slatIterator = createDuration(0);
        var labelInterval = getLabelInterval(labelIntervalInput, slotDuration);
        var metas = [];
        while (asRoughMs(slatTime) < asRoughMs(slotMaxTime)) {
            var date = dateEnv.add(dayStart, slatTime);
            var isLabeled = wholeDivideDurations(slatIterator, labelInterval) !== null;
            metas.push({
                date: date,
                time: slatTime,
                key: date.toISOString(),
                isoTimeStr: formatIsoTimeString(date),
                isLabeled: isLabeled
            });
            slatTime = addDurations(slatTime, slotDuration);
            slatIterator = addDurations(slatIterator, slotDuration);
        }
        return metas;
    }
    function getLabelInterval(optionInput, slotDuration) {
        // might be an array value (for TimelineView).
        // if so, getting the most granular entry (the last one probably).
        if (Array.isArray(optionInput)) {
            optionInput = optionInput[optionInput.length - 1];
        }
        return optionInput ?
            createDuration(optionInput) :
            computeLabelInterval(slotDuration);
    }
    // Computes an automatic value for slotLabelInterval
    function computeLabelInterval(slotDuration) {
        var i;
        var labelInterval;
        var slotsPerLabel;
        // find the smallest stock label interval that results in more than one slots-per-label
        for (i = STOCK_SUB_DURATIONS.length - 1; i >= 0; i--) {
            labelInterval = createDuration(STOCK_SUB_DURATIONS[i]);
            slotsPerLabel = wholeDivideDurations(labelInterval, slotDuration);
            if (slotsPerLabel !== null && slotsPerLabel > 1) {
                return labelInterval;
            }
        }
        return slotDuration; // fall back
    }

    var DEFAULT_WEEK_NUM_FORMAT$1 = { week: 'short' };
    var AUTO_ALL_DAY_MAX_EVENT_ROWS = 5;
    /* An abstract class for all timegrid-related views. Displays one more columns with time slots running vertically.
    ----------------------------------------------------------------------------------------------------------------------*/
    // Is a manager for the TimeCols subcomponent and possibly the DayGrid subcomponent (if allDaySlot is on).
    // Responsible for managing width/height.
    var TimeColsView = /** @class */ (function (_super) {
        __extends(TimeColsView, _super);
        function TimeColsView() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.allDaySplitter = new AllDaySplitter(); // for use by subclasses
            _this.headerElRef = y();
            _this.rootElRef = y();
            _this.scrollerElRef = y();
            _this.handleScrollTopRequest = function (scrollTop) {
                _this.scrollerElRef.current.scrollTop = scrollTop;
            };
            /* Header Render Methods
            ------------------------------------------------------------------------------------------------------------------*/
            _this.renderHeadAxis = function () {
                var options = _this.context.options;
                var range = _this.props.dateProfile.renderRange;
                var dayCnt = diffDays(range.start, range.end);
                var navLinkData = (options.navLinks && dayCnt === 1) // only do in day views (to avoid doing in week views that dont need it)
                    ? buildNavLinkData(range.start, 'week')
                    : null;
                if (options.weekNumbers) {
                    return (h(WeekNumberRoot, { date: range.start, defaultFormat: DEFAULT_WEEK_NUM_FORMAT$1 }, function (rootElRef, classNames, innerElRef, innerContent) { return (h("th", { ref: rootElRef, class: [
                            'fc-timegrid-axis',
                            'fc-scrollgrid-shrink'
                        ].concat(classNames).join(' ') },
                        h("div", { class: 'fc-timegrid-axis-frame fc-scrollgrid-shrink-frame fc-timegrid-axis-frame-liquid' },
                            h("a", { class: 'fc-timegrid-axis-cushion fc-scrollgrid-shrink-cushion', "data-navlink": navLinkData, ref: innerElRef }, innerContent)))); }));
                }
                return (h("th", { class: 'fc-timegrid-axis' }));
            };
            /* Table Component Render Methods
            ------------------------------------------------------------------------------------------------------------------*/
            // only a one-way height sync. we don't send the axis inner-content height to the DayGrid,
            // but DayGrid still needs to have classNames on inner elements in order to measure.
            _this.renderTableRowAxis = function (rowHeight) {
                var context = _this.context;
                var hookProps = {
                    text: context.options.allDayText,
                    view: context.view
                };
                return (
                // TODO: make reusable hook. used in list view too
                h(RenderHook, { name: 'allDay', hookProps: hookProps, defaultContent: renderAllDayInner }, function (rootElRef, classNames, innerElRef, innerContent) { return (h("td", { ref: rootElRef, className: [
                        'fc-timegrid-axis',
                        'fc-scrollgrid-shrink'
                    ].concat(classNames).join(' ') },
                    h("div", { class: 'fc-timegrid-axis-frame fc-scrollgrid-shrink-frame' + (rowHeight == null ? ' fc-timegrid-axis-frame-liquid' : ''), style: { height: rowHeight } },
                        h("span", { class: 'fc-timegrid-axis-cushion fc-scrollgrid-shrink-cushion', ref: innerElRef }, innerContent)))); }));
            };
            return _this;
        }
        // rendering
        // ----------------------------------------------------------------------------------------------------
        TimeColsView.prototype.renderSimpleLayout = function (headerRowContent, allDayContent, timeContent) {
            var _a = this, context = _a.context, props = _a.props;
            var sections = [];
            var stickyHeaderDates = getStickyHeaderDates(context.options);
            if (headerRowContent) {
                sections.push({
                    type: 'header',
                    isSticky: stickyHeaderDates,
                    chunk: {
                        elRef: this.headerElRef,
                        tableClassName: 'fc-col-header',
                        rowContent: headerRowContent
                    }
                });
            }
            if (allDayContent) {
                sections.push({
                    key: 'all-day',
                    type: 'body',
                    chunk: { content: allDayContent }
                });
                sections.push({
                    outerContent: (h("tr", { class: 'fc-scrollgrid-section fc-scrollgrid-section-body' },
                        h("td", { class: 'fc-timegrid-divider fc-divider ' + context.theme.getClass('tableCellShaded') })))
                });
            }
            sections.push({
                key: 'timed',
                type: 'body',
                liquid: true,
                expandRows: Boolean(context.options.expandRows),
                chunk: {
                    scrollerElRef: this.scrollerElRef,
                    content: timeContent
                }
            });
            return (h(ViewRoot, { viewSpec: props.viewSpec, elRef: this.rootElRef }, function (rootElRef, classNames) { return (h("div", { class: ['fc-timegrid'].concat(classNames).join(' '), ref: rootElRef },
                h(SimpleScrollGrid, { forPrint: props.forPrint, liquid: !props.isHeightAuto, cols: [{ width: 'shrink' }], sections: sections }))); }));
        };
        TimeColsView.prototype.renderHScrollLayout = function (headerRowContent, allDayContent, timeContent, colCnt, dayMinWidth, slatMetas) {
            var _this = this;
            var ScrollGrid = this.context.pluginHooks.scrollGridImpl;
            if (!ScrollGrid) {
                throw new Error('No ScrollGrid implementation');
            }
            var _a = this, context = _a.context, props = _a.props;
            var stickyHeaderDates = getStickyHeaderDates(context.options);
            var stickyFooterScrollbar = getStickyFooterScrollbar(context.options);
            var sections = [];
            if (headerRowContent) {
                sections.push({
                    type: 'header',
                    isSticky: stickyHeaderDates,
                    chunks: [
                        {
                            rowContent: h("tr", null, this.renderHeadAxis())
                        },
                        {
                            elRef: this.headerElRef,
                            tableClassName: 'fc-col-header',
                            rowContent: headerRowContent
                        }
                    ]
                });
            }
            if (allDayContent) {
                sections.push({
                    key: 'all-day',
                    type: 'body',
                    syncRowHeights: true,
                    chunks: [
                        {
                            rowContent: function (contentArg) { return (h("tr", null, _this.renderTableRowAxis(contentArg.rowSyncHeights[0]))); },
                        },
                        {
                            content: allDayContent
                        }
                    ]
                });
                sections.push({
                    outerContent: (h("tr", { class: 'fc-scrollgrid-section fc-scrollgrid-section-body' },
                        h("td", { colSpan: 2, class: 'fc-timegrid-divider fc-divider ' + context.theme.getClass('tableCellShaded') })))
                });
            }
            sections.push({
                key: 'timed',
                type: 'body',
                liquid: true,
                expandRows: Boolean(context.options.expandRows),
                chunks: [
                    {
                        rowContent: h(TimeBodyAxis, { slatMetas: slatMetas })
                    },
                    {
                        scrollerElRef: this.scrollerElRef,
                        content: timeContent
                    }
                ]
            });
            if (stickyFooterScrollbar) {
                sections.push({
                    key: 'scroll',
                    type: 'footer',
                    isSticky: true,
                    chunks: [
                        { content: renderScrollShim },
                        { content: renderScrollShim }
                    ]
                });
            }
            return (h(ViewRoot, { viewSpec: props.viewSpec, elRef: this.rootElRef }, function (rootElRef, classNames) { return (h("div", { class: ['fc-timegrid'].concat(classNames).join(' '), ref: rootElRef },
                h(ScrollGrid, { forPrint: props.forPrint, liquid: !props.isHeightAuto, colGroups: [
                        { width: 'shrink', cols: [{ width: 'shrink' }] },
                        { cols: [{ span: colCnt, minWidth: dayMinWidth }] }
                    ], sections: sections }))); }));
        };
        /* Dimensions
        ------------------------------------------------------------------------------------------------------------------*/
        TimeColsView.prototype.getAllDayMaxEventProps = function () {
            var _a = this.context.options, dayMaxEvents = _a.dayMaxEvents, dayMaxEventRows = _a.dayMaxEventRows;
            if (dayMaxEvents === true || dayMaxEventRows === true) { // is auto?
                dayMaxEvents = undefined;
                dayMaxEventRows = AUTO_ALL_DAY_MAX_EVENT_ROWS; // make sure "auto" goes to a real number
            }
            return { dayMaxEvents: dayMaxEvents, dayMaxEventRows: dayMaxEventRows };
        };
        return TimeColsView;
    }(DateComponent));
    function renderAllDayInner(hookProps) {
        return hookProps.text;
    }
    var TimeBodyAxis = /** @class */ (function (_super) {
        __extends(TimeBodyAxis, _super);
        function TimeBodyAxis() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TimeBodyAxis.prototype.render = function (props) {
            return props.slatMetas.map(function (slatMeta) { return (h("tr", null,
                h(TimeColsAxisCell, __assign({}, slatMeta)))); });
        };
        return TimeBodyAxis;
    }(BaseComponent));

    function splitSegsByCol(segs, colCnt) {
        var segsByCol = [];
        var i;
        for (i = 0; i < colCnt; i++) {
            segsByCol.push([]);
        }
        if (segs) {
            for (i = 0; i < segs.length; i++) {
                segsByCol[segs[i].col].push(segs[i]);
            }
        }
        return segsByCol;
    }
    function splitInteractionByCol(ui, colCnt) {
        var byRow = [];
        if (!ui) {
            for (var i = 0; i < colCnt; i++) {
                byRow[i] = null;
            }
        }
        else {
            for (var i = 0; i < colCnt; i++) {
                byRow[i] = {
                    affectedInstances: ui.affectedInstances,
                    isEvent: ui.isEvent,
                    segs: []
                };
            }
            for (var _i = 0, _a = ui.segs; _i < _a.length; _i++) {
                var seg = _a[_i];
                byRow[seg.col].segs.push(seg);
            }
        }
        return byRow;
    }

    // UNFORTUNATELY, assigns results to the top/bottom/level/forwardCoord/backwardCoord props of the actual segs.
    // TODO: return hash (by instanceId) of results
    function computeSegCoords(segs, dayDate, slatCoords, eventMinHeight, eventOrderSpecs) {
        computeSegVerticals(segs, dayDate, slatCoords, eventMinHeight);
        return computeSegHorizontals(segs, eventOrderSpecs); // requires top/bottom from computeSegVerticals
    }
    // For each segment in an array, computes and assigns its top and bottom properties
    function computeSegVerticals(segs, dayDate, slatCoords, eventMinHeight) {
        for (var _i = 0, segs_1 = segs; _i < segs_1.length; _i++) {
            var seg = segs_1[_i];
            seg.top = slatCoords.computeDateTop(seg.start, dayDate);
            seg.bottom = Math.max(seg.top + (eventMinHeight || 0), // yuck
            slatCoords.computeDateTop(seg.end, dayDate));
        }
    }
    // Given an array of segments that are all in the same column, sets the backwardCoord and forwardCoord on each.
    // Assumed the segs are already ordered.
    // NOTE: Also reorders the given array by date!
    function computeSegHorizontals(segs, eventOrderSpecs) {
        // IMPORTANT TO CLEAR OLD RESULTS :(
        for (var _i = 0, segs_2 = segs; _i < segs_2.length; _i++) {
            var seg = segs_2[_i];
            seg.level = null;
            seg.forwardCoord = null;
            seg.backwardCoord = null;
            seg.forwardPressure = null;
        }
        segs = sortEventSegs(segs, eventOrderSpecs);
        var level0;
        var levels = buildSlotSegLevels(segs);
        computeForwardSlotSegs(levels);
        if ((level0 = levels[0])) {
            for (var _a = 0, level0_1 = level0; _a < level0_1.length; _a++) {
                var seg = level0_1[_a];
                computeSlotSegPressures(seg);
            }
            for (var _b = 0, level0_2 = level0; _b < level0_2.length; _b++) {
                var seg = level0_2[_b];
                computeSegForwardBack(seg, 0, 0, eventOrderSpecs);
            }
        }
        return segs;
    }
    // Builds an array of segments "levels". The first level will be the leftmost tier of segments if the calendar is
    // left-to-right, or the rightmost if the calendar is right-to-left. Assumes the segments are already ordered by date.
    function buildSlotSegLevels(segs) {
        var levels = [];
        var i;
        var seg;
        var j;
        for (i = 0; i < segs.length; i++) {
            seg = segs[i];
            // go through all the levels and stop on the first level where there are no collisions
            for (j = 0; j < levels.length; j++) {
                if (!computeSlotSegCollisions(seg, levels[j]).length) {
                    break;
                }
            }
            seg.level = j;
            (levels[j] || (levels[j] = [])).push(seg);
        }
        return levels;
    }
    // Find all the segments in `otherSegs` that vertically collide with `seg`.
    // Append into an optionally-supplied `results` array and return.
    function computeSlotSegCollisions(seg, otherSegs, results) {
        if (results === void 0) { results = []; }
        for (var i = 0; i < otherSegs.length; i++) {
            if (isSlotSegCollision(seg, otherSegs[i])) {
                results.push(otherSegs[i]);
            }
        }
        return results;
    }
    // Do these segments occupy the same vertical space?
    function isSlotSegCollision(seg1, seg2) {
        return seg1.bottom > seg2.top && seg1.top < seg2.bottom;
    }
    // For every segment, figure out the other segments that are in subsequent
    // levels that also occupy the same vertical space. Accumulate in seg.forwardSegs
    function computeForwardSlotSegs(levels) {
        var i;
        var level;
        var j;
        var seg;
        var k;
        for (i = 0; i < levels.length; i++) {
            level = levels[i];
            for (j = 0; j < level.length; j++) {
                seg = level[j];
                seg.forwardSegs = [];
                for (k = i + 1; k < levels.length; k++) {
                    computeSlotSegCollisions(seg, levels[k], seg.forwardSegs);
                }
            }
        }
    }
    // Figure out which path forward (via seg.forwardSegs) results in the longest path until
    // the furthest edge is reached. The number of segments in this path will be seg.forwardPressure
    function computeSlotSegPressures(seg) {
        var forwardSegs = seg.forwardSegs;
        var forwardPressure = 0;
        var i;
        var forwardSeg;
        if (seg.forwardPressure == null) { // not already computed
            for (i = 0; i < forwardSegs.length; i++) {
                forwardSeg = forwardSegs[i];
                // figure out the child's maximum forward path
                computeSlotSegPressures(forwardSeg);
                // either use the existing maximum, or use the child's forward pressure
                // plus one (for the forwardSeg itself)
                forwardPressure = Math.max(forwardPressure, 1 + forwardSeg.forwardPressure);
            }
            seg.forwardPressure = forwardPressure;
        }
    }
    // Calculate seg.forwardCoord and seg.backwardCoord for the segment, where both values range
    // from 0 to 1. If the calendar is left-to-right, the seg.backwardCoord maps to "left" and
    // seg.forwardCoord maps to "right" (via percentage). Vice-versa if the calendar is right-to-left.
    //
    // The segment might be part of a "series", which means consecutive segments with the same pressure
    // who's width is unknown until an edge has been hit. `seriesBackwardPressure` is the number of
    // segments behind this one in the current series, and `seriesBackwardCoord` is the starting
    // coordinate of the first segment in the series.
    function computeSegForwardBack(seg, seriesBackwardPressure, seriesBackwardCoord, eventOrderSpecs) {
        var forwardSegs = seg.forwardSegs;
        var i;
        if (seg.forwardCoord == null) { // not already computed
            if (!forwardSegs.length) {
                // if there are no forward segments, this segment should butt up against the edge
                seg.forwardCoord = 1;
            }
            else {
                // sort highest pressure first
                sortForwardSegs(forwardSegs, eventOrderSpecs);
                // this segment's forwardCoord will be calculated from the backwardCoord of the
                // highest-pressure forward segment.
                computeSegForwardBack(forwardSegs[0], seriesBackwardPressure + 1, seriesBackwardCoord, eventOrderSpecs);
                seg.forwardCoord = forwardSegs[0].backwardCoord;
            }
            // calculate the backwardCoord from the forwardCoord. consider the series
            seg.backwardCoord = seg.forwardCoord -
                (seg.forwardCoord - seriesBackwardCoord) / // available width for series
                    (seriesBackwardPressure + 1); // # of segments in the series
            // use this segment's coordinates to computed the coordinates of the less-pressurized
            // forward segments
            for (i = 0; i < forwardSegs.length; i++) {
                computeSegForwardBack(forwardSegs[i], 0, seg.forwardCoord, eventOrderSpecs);
            }
        }
    }
    function sortForwardSegs(forwardSegs, eventOrderSpecs) {
        var objs = forwardSegs.map(buildTimeGridSegCompareObj);
        var specs = [
            // put higher-pressure first
            { field: 'forwardPressure', order: -1 },
            // put segments that are closer to initial edge first (and favor ones with no coords yet)
            { field: 'backwardCoord', order: 1 }
        ].concat(eventOrderSpecs);
        objs.sort(function (obj0, obj1) {
            return compareByFieldSpecs(obj0, obj1, specs);
        });
        return objs.map(function (c) {
            return c._seg;
        });
    }
    function buildTimeGridSegCompareObj(seg) {
        var obj = buildSegCompareObj(seg);
        obj.forwardPressure = seg.forwardPressure;
        obj.backwardCoord = seg.backwardCoord;
        return obj;
    }

    var DEFAULT_TIME_FORMAT = {
        hour: 'numeric',
        minute: '2-digit',
        meridiem: false
    };
    var TimeColEvent = /** @class */ (function (_super) {
        __extends(TimeColEvent, _super);
        function TimeColEvent() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TimeColEvent.prototype.render = function (props) {
            return (h(StandardEvent, __assign({}, props, { defaultTimeFormat: DEFAULT_TIME_FORMAT, extraClassNames: ['fc-timegrid-event', 'fc-v-event'] })));
        };
        return TimeColEvent;
    }(BaseComponent));

    var TimeCol = /** @class */ (function (_super) {
        __extends(TimeCol, _super);
        function TimeCol() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TimeCol.prototype.render = function (props, state, context) {
            var _this = this;
            var options = context.options;
            var mirrorSegs = (props.eventDrag && props.eventDrag.segs) ||
                (props.eventResize && props.eventResize.segs) ||
                (options.selectMirror && props.dateSelectionSegs) ||
                [];
            var interactionAffectedInstances = // TODO: messy way to compute this
             (props.eventDrag && props.eventDrag.affectedInstances) ||
                (props.eventResize && props.eventResize.affectedInstances) ||
                {};
            return (h(DayCellRoot, { elRef: props.elRef, date: props.date, todayRange: props.todayRange, extraHookProps: props.extraHookProps, dateProfile: props.dateProfile }, function (rootElRef, classNames, dataAttrs) { return (h("td", __assign({ ref: rootElRef, className: ['fc-timegrid-col'].concat(classNames, props.extraClassNames || []).join(' ') }, dataAttrs, props.extraDataAttrs),
                h("div", { class: 'fc-timegrid-col-origin' },
                    h("div", { class: 'fc-timegrid-col-events' },
                        h(d, null, _this.renderFgSegs(mirrorSegs, {}, Boolean(props.eventDrag), Boolean(props.eventResize), Boolean(options.selectMirror)
                        // TODO: pass in left/right instead of using only computeSegTopBottomCss
                        )),
                        h(d, null, _this.renderFgSegs(props.fgEventSegs, interactionAffectedInstances))),
                    h("div", { class: 'fc-timegrid-col-bg' },
                        h(d, null, _this.renderFillSegs(props.businessHourSegs, 'non-business')),
                        h(d, null, _this.renderFillSegs(props.bgEventSegs, 'bg-event')),
                        h(d, null, _this.renderFillSegs(props.dateSelectionSegs, 'highlight'))),
                    _this.renderNowIndicator(props.nowIndicatorSegs)),
                h(TimeColMisc, { date: props.date, todayRange: props.todayRange, extraHookProps: props.extraHookProps }))); }));
        };
        TimeCol.prototype.renderFgSegs = function (segs, segIsInvisible, isDragging, isResizing, isDateSelecting) {
            var _this = this;
            var _a = this, context = _a.context, props = _a.props;
            if (!props.slatCoords) {
                return;
            }
            // assigns TO THE SEGS THEMSELVES
            // also, receives resorted array
            segs = computeSegCoords(segs, props.date, props.slatCoords, context.options.eventMinHeight, context.eventOrderSpecs);
            return segs.map(function (seg) {
                var instanceId = seg.eventRange.instance.instanceId;
                var isMirror = isDragging || isResizing || isDateSelecting;
                var positionCss = isMirror ? __assign({ left: 0, right: 0 }, _this.computeSegTopBottomCss(seg)) :
                    _this.computeFgSegPositionCss(seg);
                return (h("div", { class: 'fc-timegrid-event-harness' + (seg.level > 0 ? ' fc-timegrid-event-harness-inset' : ''), key: instanceId, style: __assign({ visibility: segIsInvisible[instanceId] ? 'hidden' : '' }, positionCss) },
                    h(TimeColEvent, __assign({ seg: seg, isDragging: isDragging, isResizing: isResizing, isDateSelecting: isDateSelecting, isSelected: instanceId === props.eventSelection }, getSegMeta(seg, props.todayRange, props.nowDate)))));
            });
        };
        TimeCol.prototype.renderFillSegs = function (segs, fillType) {
            var _this = this;
            var _a = this, context = _a.context, props = _a.props;
            if (!props.slatCoords) {
                return;
            }
            // BAD: assigns TO THE SEGS THEMSELVES
            computeSegVerticals(segs, props.date, props.slatCoords, context.options.eventMinHeight);
            return segs.map(function (seg) {
                // inverse-background events don't have specific instances
                // TODO: might be a key collision. better solution
                var eventRange = seg.eventRange;
                var key = eventRange.instance ? eventRange.instance.instanceId : eventRange.def.defId;
                return (h("div", { class: 'fc-timegrid-bg-harness', style: _this.computeSegTopBottomCss(seg) }, fillType === 'bg-event' ?
                    h(BgEvent, __assign({ key: key, seg: seg }, getSegMeta(seg, props.todayRange, props.nowDate))) :
                    renderFill(fillType)));
            });
        };
        TimeCol.prototype.renderNowIndicator = function (segs) {
            var _a = this.props, slatCoords = _a.slatCoords, date = _a.date;
            if (!slatCoords) {
                return;
            }
            return segs.map(function (seg) { return (h(NowIndicatorRoot, { isAxis: false, date: date }, function (rootElRef, classNames, innerElRef, innerContent) { return (h("div", { ref: rootElRef, class: ['fc-timegrid-now-indicator-line'].concat(classNames).join(' '), style: { top: slatCoords.computeDateTop(seg.start, date) } }, innerContent)); })); });
        };
        TimeCol.prototype.computeFgSegPositionCss = function (seg) {
            var _a = this.context, isRtl = _a.isRtl, options = _a.options;
            var shouldOverlap = options.slotEventOverlap;
            var backwardCoord = seg.backwardCoord; // the left side if LTR. the right side if RTL. floating-point
            var forwardCoord = seg.forwardCoord; // the right side if LTR. the left side if RTL. floating-point
            var left; // amount of space from left edge, a fraction of the total width
            var right; // amount of space from right edge, a fraction of the total width
            if (shouldOverlap) {
                // double the width, but don't go beyond the maximum forward coordinate (1.0)
                forwardCoord = Math.min(1, backwardCoord + (forwardCoord - backwardCoord) * 2);
            }
            if (isRtl) {
                left = 1 - forwardCoord;
                right = backwardCoord;
            }
            else {
                left = backwardCoord;
                right = 1 - forwardCoord;
            }
            var props = {
                zIndex: seg.level + 1,
                left: left * 100 + '%',
                right: right * 100 + '%'
            };
            if (shouldOverlap && seg.forwardPressure) {
                // add padding to the edge so that forward stacked events don't cover the resizer's icon
                props[isRtl ? 'marginLeft' : 'marginRight'] = 10 * 2; // 10 is a guesstimate of the icon's width
            }
            return __assign(__assign({}, props), this.computeSegTopBottomCss(seg));
        };
        TimeCol.prototype.computeSegTopBottomCss = function (seg) {
            return {
                top: seg.top,
                bottom: -seg.bottom
            };
        };
        return TimeCol;
    }(BaseComponent));
    var TimeColMisc = /** @class */ (function (_super) {
        __extends(TimeColMisc, _super);
        function TimeColMisc() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        TimeColMisc.prototype.render = function (props) {
            return (h(DayCellContent, { date: props.date, todayRange: props.todayRange, extraHookProps: props.extraHookProps }, function (innerElRef, innerContent) { return (innerContent &&
                h("div", { class: 'fc-timegrid-col-misc', ref: innerElRef }, innerContent)); }));
        };
        return TimeColMisc;
    }(BaseComponent));

    var TimeColsContent = /** @class */ (function (_super) {
        __extends(TimeColsContent, _super);
        function TimeColsContent() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.splitFgEventSegs = memoize(splitSegsByCol);
            _this.splitBgEventSegs = memoize(splitSegsByCol);
            _this.splitBusinessHourSegs = memoize(splitSegsByCol);
            _this.splitNowIndicatorSegs = memoize(splitSegsByCol);
            _this.splitDateSelectionSegs = memoize(splitSegsByCol);
            _this.splitEventDrag = memoize(splitInteractionByCol);
            _this.splitEventResize = memoize(splitInteractionByCol);
            _this.rootElRef = y();
            _this.cellElRefs = new RefMap();
            return _this;
        }
        TimeColsContent.prototype.render = function (props, state, context) {
            var _this = this;
            var nowIndicatorTop = context.options.nowIndicator &&
                props.slatCoords &&
                props.slatCoords.safeComputeTop(props.nowDate);
            var colCnt = props.cells.length;
            var fgEventSegsByRow = this.splitFgEventSegs(props.fgEventSegs, colCnt);
            var bgEventSegsByRow = this.splitBgEventSegs(props.bgEventSegs, colCnt);
            var businessHourSegsByRow = this.splitBusinessHourSegs(props.businessHourSegs, colCnt);
            var nowIndicatorSegsByRow = this.splitNowIndicatorSegs(props.nowIndicatorSegs, colCnt);
            var dateSelectionSegsByRow = this.splitDateSelectionSegs(props.dateSelectionSegs, colCnt);
            var eventDragByRow = this.splitEventDrag(props.eventDrag, colCnt);
            var eventResizeByRow = this.splitEventResize(props.eventResize, colCnt);
            return (h("div", { class: 'fc-timegrid-cols', ref: this.rootElRef },
                h("table", { style: {
                        minWidth: props.tableMinWidth,
                        width: props.clientWidth
                    } },
                    props.tableColGroupNode,
                    h("tbody", null,
                        h("tr", null,
                            props.axis &&
                                h("td", { class: 'fc-timegrid-axis' }),
                            props.cells.map(function (cell, i) { return (h(TimeCol, { key: cell.key, elRef: _this.cellElRefs.createRef(cell.key), date: cell.date, dateProfile: props.dateProfile, nowDate: props.nowDate, todayRange: props.todayRange, extraHookProps: cell.extraHookProps, extraDataAttrs: cell.extraDataAttrs, extraClassNames: cell.extraClassNames, fgEventSegs: fgEventSegsByRow[i], bgEventSegs: bgEventSegsByRow[i], businessHourSegs: businessHourSegsByRow[i], nowIndicatorSegs: nowIndicatorSegsByRow[i], dateSelectionSegs: dateSelectionSegsByRow[i], eventDrag: eventDragByRow[i], eventResize: eventResizeByRow[i], slatCoords: props.slatCoords, eventSelection: props.eventSelection })); })))),
                nowIndicatorTop != null &&
                    h(NowIndicatorRoot, { isAxis: true, date: props.nowDate }, function (rootElRef, classNames, innerElRef, innerContent) { return (h("div", { ref: rootElRef, class: ['fc-timegrid-now-indicator-arrow'].concat(classNames).join(' '), style: { top: nowIndicatorTop } }, innerContent)); })));
        };
        TimeColsContent.prototype.componentDidMount = function () {
            this.updateCoords();
        };
        TimeColsContent.prototype.componentDidUpdate = function () {
            this.updateCoords();
        };
        TimeColsContent.prototype.updateCoords = function () {
            var props = this.props;
            if (props.onColCoords && props.clientWidth !== null) { // means sizing has stabilized
                props.onColCoords(new PositionCache(this.rootElRef.current, collectCellEls(this.cellElRefs.currentMap, props.cells), true, // horizontal
                false));
            }
        };
        return TimeColsContent;
    }(BaseComponent));
    function collectCellEls(elMap, cells) {
        return cells.map(function (cell) { return elMap[cell.key]; });
    }

    /* A component that renders one or more columns of vertical time slots
    ----------------------------------------------------------------------------------------------------------------------*/
    var TimeCols = /** @class */ (function (_super) {
        __extends(TimeCols, _super);
        function TimeCols() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.processSlotOptions = memoize(processSlotOptions);
            _this.handleScrollRequest = function (request) {
                var onScrollTopRequest = _this.props.onScrollTopRequest;
                var slatCoords = _this.state.slatCoords;
                if (onScrollTopRequest && slatCoords) {
                    if (request.time) {
                        var top_1 = slatCoords.computeTimeTop(request.time);
                        top_1 = Math.ceil(top_1); // zoom can give weird floating-point values. rather scroll a little bit further
                        if (top_1) {
                            top_1++;
                        } // to overcome top border that slots beyond the first have. looks better
                        onScrollTopRequest(top_1);
                    }
                    return true;
                }
            };
            _this.handleColCoords = function (colCoords) {
                _this.colCoords = colCoords;
            };
            _this.handleSlatCoords = function (slatCoords) {
                _this.setState({ slatCoords: slatCoords });
            };
            return _this;
        }
        TimeCols.prototype.render = function (props, state) {
            var dateProfile = props.dateProfile;
            return (h("div", { class: 'fc-timegrid-body', ref: props.rootElRef, style: {
                    // these props are important to give this wrapper correct dimensions for interactions
                    // TODO: if we set it here, can we avoid giving to inner tables?
                    width: props.clientWidth,
                    minWidth: props.tableMinWidth
                } },
                h(TimeColsSlats, { dateProfile: dateProfile, axis: props.axis, slatMetas: props.slatMetas, clientWidth: props.clientWidth, minHeight: props.expandRows ? props.clientHeight : '', tableMinWidth: props.tableMinWidth, tableColGroupNode: props.axis ? props.tableColGroupNode : null /* axis depends on the colgroup's shrinking */, onCoords: this.handleSlatCoords }),
                h(TimeColsContent, { cells: props.cells, dateProfile: props.dateProfile, axis: props.axis, businessHourSegs: props.businessHourSegs, bgEventSegs: props.bgEventSegs, fgEventSegs: props.fgEventSegs, dateSelectionSegs: props.dateSelectionSegs, eventSelection: props.eventSelection, eventDrag: props.eventDrag, eventResize: props.eventResize, todayRange: props.todayRange, nowDate: props.nowDate, nowIndicatorSegs: props.nowIndicatorSegs, clientWidth: props.clientWidth, tableMinWidth: props.tableMinWidth, tableColGroupNode: props.tableColGroupNode, slatCoords: state.slatCoords, onColCoords: this.handleColCoords, forPrint: props.forPrint })));
        };
        TimeCols.prototype.componentDidMount = function () {
            this.scrollResponder = this.context.createScrollResponder(this.handleScrollRequest);
        };
        TimeCols.prototype.componentDidUpdate = function (prevProps) {
            this.scrollResponder.update(this.props.dateProfile !== prevProps.dateProfile);
        };
        TimeCols.prototype.componentWillUnmount = function () {
            this.scrollResponder.detach();
        };
        TimeCols.prototype.positionToHit = function (positionLeft, positionTop) {
            var _a = this.context, dateEnv = _a.dateEnv, options = _a.options;
            var colCoords = this.colCoords;
            var slatCoords = this.state.slatCoords;
            var _b = this.processSlotOptions(this.props.slotDuration, options.snapDuration), snapDuration = _b.snapDuration, snapsPerSlot = _b.snapsPerSlot;
            var colIndex = colCoords.leftToIndex(positionLeft);
            var slatIndex = slatCoords.positions.topToIndex(positionTop);
            if (colIndex != null && slatIndex != null) {
                var slatTop = slatCoords.positions.tops[slatIndex];
                var slatHeight = slatCoords.positions.getHeight(slatIndex);
                var partial = (positionTop - slatTop) / slatHeight; // floating point number between 0 and 1
                var localSnapIndex = Math.floor(partial * snapsPerSlot); // the snap # relative to start of slat
                var snapIndex = slatIndex * snapsPerSlot + localSnapIndex;
                var dayDate = this.props.cells[colIndex].date;
                var time = addDurations(this.props.dateProfile.slotMinTime, multiplyDuration(snapDuration, snapIndex));
                var start = dateEnv.add(dayDate, time);
                var end = dateEnv.add(start, snapDuration);
                return {
                    col: colIndex,
                    dateSpan: {
                        range: { start: start, end: end },
                        allDay: false
                    },
                    dayEl: colCoords.els[colIndex],
                    relativeRect: {
                        left: colCoords.lefts[colIndex],
                        right: colCoords.rights[colIndex],
                        top: slatTop,
                        bottom: slatTop + slatHeight
                    }
                };
            }
        };
        return TimeCols;
    }(BaseComponent));
    function processSlotOptions(slotDuration, snapDurationInput) {
        var snapDuration = snapDurationInput ? createDuration(snapDurationInput) : slotDuration;
        var snapsPerSlot = wholeDivideDurations(slotDuration, snapDuration);
        if (snapsPerSlot === null) {
            snapDuration = slotDuration;
            snapsPerSlot = 1;
            // TODO: say warning?
        }
        return { snapDuration: snapDuration, snapsPerSlot: snapsPerSlot };
    }

    var DayTimeCols = /** @class */ (function (_super) {
        __extends(DayTimeCols, _super);
        function DayTimeCols() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.buildDayRanges = memoize(buildDayRanges);
            _this.slicer = new DayTimeColsSlicer();
            _this.timeColsRef = y();
            _this.handleRootEl = function (rootEl) {
                var calendar = _this.context.calendar;
                if (rootEl) {
                    calendar.registerInteractiveComponent(_this, { el: rootEl });
                }
                else {
                    calendar.unregisterInteractiveComponent(_this);
                }
            };
            return _this;
        }
        DayTimeCols.prototype.render = function (props, state, context) {
            var _this = this;
            var dateEnv = context.dateEnv, options = context.options, calendar = context.calendar;
            var dateProfile = props.dateProfile, dayTableModel = props.dayTableModel;
            var dayRanges = this.buildDayRanges(dayTableModel, dateProfile, dateEnv);
            // give it the first row of cells
            return (h(NowTimer // TODO: would move this further down hierarchy, but sliceNowDate needs it
            , { unit: options.nowIndicator ? 'minute' : 'day', content: function (nowDate, todayRange) { return (h(TimeCols, __assign({ ref: _this.timeColsRef, rootElRef: _this.handleRootEl }, _this.slicer.sliceProps(props, dateProfile, null, context.calendar, dayRanges), { dateProfile: dateProfile, axis: props.axis, slatMetas: props.slatMetas, slotDuration: props.slotDuration, cells: dayTableModel.cells[0], tableColGroupNode: props.tableColGroupNode, tableMinWidth: props.tableMinWidth, clientWidth: props.clientWidth, clientHeight: props.clientHeight, expandRows: props.expandRows, nowDate: nowDate, nowIndicatorSegs: options.nowIndicator && _this.slicer.sliceNowDate(nowDate, calendar, dayRanges), todayRange: todayRange, onScrollTopRequest: props.onScrollTopRequest, forPrint: props.forPrint }))); } }));
        };
        DayTimeCols.prototype.queryHit = function (positionLeft, positionTop) {
            var rawHit = this.timeColsRef.current.positionToHit(positionLeft, positionTop);
            if (rawHit) {
                return {
                    component: this,
                    dateSpan: rawHit.dateSpan,
                    dayEl: rawHit.dayEl,
                    rect: {
                        left: rawHit.relativeRect.left,
                        right: rawHit.relativeRect.right,
                        top: rawHit.relativeRect.top,
                        bottom: rawHit.relativeRect.bottom
                    },
                    layer: 0
                };
            }
        };
        return DayTimeCols;
    }(DateComponent));
    function buildDayRanges(dayTableModel, dateProfile, dateEnv) {
        var ranges = [];
        for (var _i = 0, _a = dayTableModel.headerDates; _i < _a.length; _i++) {
            var date = _a[_i];
            ranges.push({
                start: dateEnv.add(date, dateProfile.slotMinTime),
                end: dateEnv.add(date, dateProfile.slotMaxTime)
            });
        }
        return ranges;
    }
    var DayTimeColsSlicer = /** @class */ (function (_super) {
        __extends(DayTimeColsSlicer, _super);
        function DayTimeColsSlicer() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        DayTimeColsSlicer.prototype.sliceRange = function (range, dayRanges) {
            var segs = [];
            for (var col = 0; col < dayRanges.length; col++) {
                var segRange = intersectRanges(range, dayRanges[col]);
                if (segRange) {
                    segs.push({
                        start: segRange.start,
                        end: segRange.end,
                        isStart: segRange.start.valueOf() === range.start.valueOf(),
                        isEnd: segRange.end.valueOf() === range.end.valueOf(),
                        col: col
                    });
                }
            }
            return segs;
        };
        return DayTimeColsSlicer;
    }(Slicer));

    var DayTimeColsView = /** @class */ (function (_super) {
        __extends(DayTimeColsView, _super);
        function DayTimeColsView() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.buildTimeColsModel = memoize(buildTimeColsModel);
            _this.parseSlotDuration = memoize(createDuration);
            _this.buildSlatMetas = memoize(buildSlatMetas);
            return _this;
        }
        DayTimeColsView.prototype.render = function (props, state, context) {
            var _this = this;
            var dateProfile = props.dateProfile, dateProfileGenerator = props.dateProfileGenerator;
            var nextDayThreshold = context.nextDayThreshold, options = context.options, dateEnv = context.dateEnv;
            var dayTableModel = this.buildTimeColsModel(dateProfile, dateProfileGenerator);
            var splitProps = this.allDaySplitter.splitProps(props);
            var slotDuration = this.parseSlotDuration(options.slotDuration);
            var slatMetas = this.buildSlatMetas(dateProfile.slotMinTime, dateProfile.slotMaxTime, options.slotLabelInterval, slotDuration, dateEnv);
            var dayMinWidth = options.dayMinWidth;
            var headerContent = options.dayHeaders &&
                h(DayHeader, { dateProfile: dateProfile, dates: dayTableModel.headerDates, datesRepDistinctDays: true, renderIntro: dayMinWidth ? null : this.renderHeadAxis });
            var allDayContent = options.allDaySlot && (function (contentArg) { return (h(DayTable, __assign({}, splitProps['allDay'], { dateProfile: dateProfile, dayTableModel: dayTableModel, nextDayThreshold: nextDayThreshold, tableMinWidth: contentArg.tableMinWidth, colGroupNode: contentArg.tableColGroupNode, renderRowIntro: dayMinWidth ? null : _this.renderTableRowAxis, showWeekNumbers: false, expandRows: false, headerAlignElRef: _this.headerElRef, clientWidth: contentArg.clientWidth, clientHeight: contentArg.clientHeight }, _this.getAllDayMaxEventProps()))); });
            var timeGridContent = function (contentArg) { return (h(DayTimeCols, __assign({}, splitProps['timed'], { dateProfile: dateProfile, dayTableModel: dayTableModel, axis: !dayMinWidth, slotDuration: slotDuration, slatMetas: slatMetas, forPrint: props.forPrint, tableColGroupNode: contentArg.tableColGroupNode, tableMinWidth: contentArg.tableMinWidth, clientWidth: contentArg.clientWidth, clientHeight: contentArg.clientHeight, expandRows: contentArg.expandRows, onScrollTopRequest: _this.handleScrollTopRequest }))); };
            return dayMinWidth
                ? this.renderHScrollLayout(headerContent, allDayContent, timeGridContent, dayTableModel.colCnt, dayMinWidth, slatMetas)
                : this.renderSimpleLayout(headerContent, allDayContent, timeGridContent);
        };
        return DayTimeColsView;
    }(TimeColsView));
    function buildTimeColsModel(dateProfile, dateProfileGenerator) {
        var daySeries = new DaySeriesModel(dateProfile.renderRange, dateProfileGenerator);
        return new DayTableModel(daySeries, false);
    }

    var main$1 = createPlugin({
        initialView: 'timeGridWeek',
        views: {
            timeGrid: {
                component: DayTimeColsView,
                usesMinMaxTime: true,
                allDaySlot: true,
                slotDuration: '00:30:00',
                slotEventOverlap: true // a bad name. confused with overlap/constraint system
            },
            timeGridDay: {
                type: 'timeGrid',
                duration: { days: 1 }
            },
            timeGridWeek: {
                type: 'timeGrid',
                duration: { weeks: 1 }
            }
        }
    });

    /*!
    FullCalendar Interaction Plugin v5.0.0-beta.2
    Docs & License: https://fullcalendar.io/
    (c) 2019 Adam Shaw
    */

    config.touchMouseIgnoreWait = 500;
    var ignoreMouseDepth = 0;
    var listenerCnt = 0;
    var isWindowTouchMoveCancelled = false;
    /*
    Uses a "pointer" abstraction, which monitors UI events for both mouse and touch.
    Tracks when the pointer "drags" on a certain element, meaning down+move+up.

    Also, tracks if there was touch-scrolling.
    Also, can prevent touch-scrolling from happening.
    Also, can fire pointermove events when scrolling happens underneath, even when no real pointer movement.

    emits:
    - pointerdown
    - pointermove
    - pointerup
    */
    var PointerDragging = /** @class */ (function () {
        function PointerDragging(containerEl) {
            var _this = this;
            this.subjectEl = null;
            this.downEl = null;
            // options that can be directly assigned by caller
            this.selector = ''; // will cause subjectEl in all emitted events to be this element
            this.handleSelector = '';
            this.shouldIgnoreMove = false;
            this.shouldWatchScroll = true; // for simulating pointermove on scroll
            // internal states
            this.isDragging = false;
            this.isTouchDragging = false;
            this.wasTouchScroll = false;
            // Mouse
            // ----------------------------------------------------------------------------------------------------
            this.handleMouseDown = function (ev) {
                if (!_this.shouldIgnoreMouse() &&
                    isPrimaryMouseButton(ev) &&
                    _this.tryStart(ev)) {
                    var pev = _this.createEventFromMouse(ev, true);
                    _this.emitter.trigger('pointerdown', pev);
                    _this.initScrollWatch(pev);
                    if (!_this.shouldIgnoreMove) {
                        document.addEventListener('mousemove', _this.handleMouseMove);
                    }
                    document.addEventListener('mouseup', _this.handleMouseUp);
                }
            };
            this.handleMouseMove = function (ev) {
                var pev = _this.createEventFromMouse(ev);
                _this.recordCoords(pev);
                _this.emitter.trigger('pointermove', pev);
            };
            this.handleMouseUp = function (ev) {
                document.removeEventListener('mousemove', _this.handleMouseMove);
                document.removeEventListener('mouseup', _this.handleMouseUp);
                _this.emitter.trigger('pointerup', _this.createEventFromMouse(ev));
                _this.cleanup(); // call last so that pointerup has access to props
            };
            // Touch
            // ----------------------------------------------------------------------------------------------------
            this.handleTouchStart = function (ev) {
                if (_this.tryStart(ev)) {
                    _this.isTouchDragging = true;
                    var pev = _this.createEventFromTouch(ev, true);
                    _this.emitter.trigger('pointerdown', pev);
                    _this.initScrollWatch(pev);
                    // unlike mouse, need to attach to target, not document
                    // https://stackoverflow.com/a/45760014
                    var target = ev.target;
                    if (!_this.shouldIgnoreMove) {
                        target.addEventListener('touchmove', _this.handleTouchMove);
                    }
                    target.addEventListener('touchend', _this.handleTouchEnd);
                    target.addEventListener('touchcancel', _this.handleTouchEnd); // treat it as a touch end
                    // attach a handler to get called when ANY scroll action happens on the page.
                    // this was impossible to do with normal on/off because 'scroll' doesn't bubble.
                    // http://stackoverflow.com/a/32954565/96342
                    window.addEventListener('scroll', _this.handleTouchScroll, true // useCapture
                    );
                }
            };
            this.handleTouchMove = function (ev) {
                var pev = _this.createEventFromTouch(ev);
                _this.recordCoords(pev);
                _this.emitter.trigger('pointermove', pev);
            };
            this.handleTouchEnd = function (ev) {
                if (_this.isDragging) { // done to guard against touchend followed by touchcancel
                    var target = ev.target;
                    target.removeEventListener('touchmove', _this.handleTouchMove);
                    target.removeEventListener('touchend', _this.handleTouchEnd);
                    target.removeEventListener('touchcancel', _this.handleTouchEnd);
                    window.removeEventListener('scroll', _this.handleTouchScroll, true); // useCaptured=true
                    _this.emitter.trigger('pointerup', _this.createEventFromTouch(ev));
                    _this.cleanup(); // call last so that pointerup has access to props
                    _this.isTouchDragging = false;
                    startIgnoringMouse();
                }
            };
            this.handleTouchScroll = function () {
                _this.wasTouchScroll = true;
            };
            this.handleScroll = function (ev) {
                if (!_this.shouldIgnoreMove) {
                    var pageX = (window.pageXOffset - _this.prevScrollX) + _this.prevPageX;
                    var pageY = (window.pageYOffset - _this.prevScrollY) + _this.prevPageY;
                    _this.emitter.trigger('pointermove', {
                        origEvent: ev,
                        isTouch: _this.isTouchDragging,
                        subjectEl: _this.subjectEl,
                        pageX: pageX,
                        pageY: pageY,
                        deltaX: pageX - _this.origPageX,
                        deltaY: pageY - _this.origPageY
                    });
                }
            };
            this.containerEl = containerEl;
            this.emitter = new EmitterMixin();
            containerEl.addEventListener('mousedown', this.handleMouseDown);
            containerEl.addEventListener('touchstart', this.handleTouchStart, { passive: true });
            listenerCreated();
        }
        PointerDragging.prototype.destroy = function () {
            this.containerEl.removeEventListener('mousedown', this.handleMouseDown);
            this.containerEl.removeEventListener('touchstart', this.handleTouchStart, { passive: true });
            listenerDestroyed();
        };
        PointerDragging.prototype.tryStart = function (ev) {
            var subjectEl = this.querySubjectEl(ev);
            var downEl = ev.target;
            if (subjectEl &&
                (!this.handleSelector || elementClosest(downEl, this.handleSelector))) {
                this.subjectEl = subjectEl;
                this.downEl = downEl;
                this.isDragging = true; // do this first so cancelTouchScroll will work
                this.wasTouchScroll = false;
                return true;
            }
            return false;
        };
        PointerDragging.prototype.cleanup = function () {
            isWindowTouchMoveCancelled = false;
            this.isDragging = false;
            this.subjectEl = null;
            this.downEl = null;
            // keep wasTouchScroll around for later access
            this.destroyScrollWatch();
        };
        PointerDragging.prototype.querySubjectEl = function (ev) {
            if (this.selector) {
                return elementClosest(ev.target, this.selector);
            }
            else {
                return this.containerEl;
            }
        };
        PointerDragging.prototype.shouldIgnoreMouse = function () {
            return ignoreMouseDepth || this.isTouchDragging;
        };
        // can be called by user of this class, to cancel touch-based scrolling for the current drag
        PointerDragging.prototype.cancelTouchScroll = function () {
            if (this.isDragging) {
                isWindowTouchMoveCancelled = true;
            }
        };
        // Scrolling that simulates pointermoves
        // ----------------------------------------------------------------------------------------------------
        PointerDragging.prototype.initScrollWatch = function (ev) {
            if (this.shouldWatchScroll) {
                this.recordCoords(ev);
                window.addEventListener('scroll', this.handleScroll, true); // useCapture=true
            }
        };
        PointerDragging.prototype.recordCoords = function (ev) {
            if (this.shouldWatchScroll) {
                this.prevPageX = ev.pageX;
                this.prevPageY = ev.pageY;
                this.prevScrollX = window.pageXOffset;
                this.prevScrollY = window.pageYOffset;
            }
        };
        PointerDragging.prototype.destroyScrollWatch = function () {
            if (this.shouldWatchScroll) {
                window.removeEventListener('scroll', this.handleScroll, true); // useCaptured=true
            }
        };
        // Event Normalization
        // ----------------------------------------------------------------------------------------------------
        PointerDragging.prototype.createEventFromMouse = function (ev, isFirst) {
            var deltaX = 0;
            var deltaY = 0;
            // TODO: repeat code
            if (isFirst) {
                this.origPageX = ev.pageX;
                this.origPageY = ev.pageY;
            }
            else {
                deltaX = ev.pageX - this.origPageX;
                deltaY = ev.pageY - this.origPageY;
            }
            return {
                origEvent: ev,
                isTouch: false,
                subjectEl: this.subjectEl,
                pageX: ev.pageX,
                pageY: ev.pageY,
                deltaX: deltaX,
                deltaY: deltaY
            };
        };
        PointerDragging.prototype.createEventFromTouch = function (ev, isFirst) {
            var touches = ev.touches;
            var pageX;
            var pageY;
            var deltaX = 0;
            var deltaY = 0;
            // if touch coords available, prefer,
            // because FF would give bad ev.pageX ev.pageY
            if (touches && touches.length) {
                pageX = touches[0].pageX;
                pageY = touches[0].pageY;
            }
            else {
                pageX = ev.pageX;
                pageY = ev.pageY;
            }
            // TODO: repeat code
            if (isFirst) {
                this.origPageX = pageX;
                this.origPageY = pageY;
            }
            else {
                deltaX = pageX - this.origPageX;
                deltaY = pageY - this.origPageY;
            }
            return {
                origEvent: ev,
                isTouch: true,
                subjectEl: this.subjectEl,
                pageX: pageX,
                pageY: pageY,
                deltaX: deltaX,
                deltaY: deltaY
            };
        };
        return PointerDragging;
    }());
    // Returns a boolean whether this was a left mouse click and no ctrl key (which means right click on Mac)
    function isPrimaryMouseButton(ev) {
        return ev.button === 0 && !ev.ctrlKey;
    }
    // Ignoring fake mouse events generated by touch
    // ----------------------------------------------------------------------------------------------------
    function startIgnoringMouse() {
        ignoreMouseDepth++;
        setTimeout(function () {
            ignoreMouseDepth--;
        }, config.touchMouseIgnoreWait);
    }
    // We want to attach touchmove as early as possible for Safari
    // ----------------------------------------------------------------------------------------------------
    function listenerCreated() {
        if (!(listenerCnt++)) {
            window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
        }
    }
    function listenerDestroyed() {
        if (!(--listenerCnt)) {
            window.removeEventListener('touchmove', onWindowTouchMove, { passive: false });
        }
    }
    function onWindowTouchMove(ev) {
        if (isWindowTouchMoveCancelled) {
            ev.preventDefault();
        }
    }

    /*
    An effect in which an element follows the movement of a pointer across the screen.
    The moving element is a clone of some other element.
    Must call start + handleMove + stop.
    */
    var ElementMirror = /** @class */ (function () {
        function ElementMirror() {
            this.isVisible = false; // must be explicitly enabled
            this.sourceEl = null;
            this.mirrorEl = null;
            this.sourceElRect = null; // screen coords relative to viewport
            // options that can be set directly by caller
            this.parentNode = document.body;
            this.zIndex = 9999;
            this.revertDuration = 0;
        }
        ElementMirror.prototype.start = function (sourceEl, pageX, pageY) {
            this.sourceEl = sourceEl;
            this.sourceElRect = this.sourceEl.getBoundingClientRect();
            this.origScreenX = pageX - window.pageXOffset;
            this.origScreenY = pageY - window.pageYOffset;
            this.deltaX = 0;
            this.deltaY = 0;
            this.updateElPosition();
        };
        ElementMirror.prototype.handleMove = function (pageX, pageY) {
            this.deltaX = (pageX - window.pageXOffset) - this.origScreenX;
            this.deltaY = (pageY - window.pageYOffset) - this.origScreenY;
            this.updateElPosition();
        };
        // can be called before start
        ElementMirror.prototype.setIsVisible = function (bool) {
            if (bool) {
                if (!this.isVisible) {
                    if (this.mirrorEl) {
                        this.mirrorEl.style.display = '';
                    }
                    this.isVisible = bool; // needs to happen before updateElPosition
                    this.updateElPosition(); // because was not updating the position while invisible
                }
            }
            else {
                if (this.isVisible) {
                    if (this.mirrorEl) {
                        this.mirrorEl.style.display = 'none';
                    }
                    this.isVisible = bool;
                }
            }
        };
        // always async
        ElementMirror.prototype.stop = function (needsRevertAnimation, callback) {
            var _this = this;
            var done = function () {
                _this.cleanup();
                callback();
            };
            if (needsRevertAnimation &&
                this.mirrorEl &&
                this.isVisible &&
                this.revertDuration && // if 0, transition won't work
                (this.deltaX || this.deltaY) // if same coords, transition won't work
            ) {
                this.doRevertAnimation(done, this.revertDuration);
            }
            else {
                setTimeout(done, 0);
            }
        };
        ElementMirror.prototype.doRevertAnimation = function (callback, revertDuration) {
            var mirrorEl = this.mirrorEl;
            var finalSourceElRect = this.sourceEl.getBoundingClientRect(); // because autoscrolling might have happened
            mirrorEl.style.transition =
                'top ' + revertDuration + 'ms,' +
                    'left ' + revertDuration + 'ms';
            applyStyle(mirrorEl, {
                left: finalSourceElRect.left,
                top: finalSourceElRect.top
            });
            whenTransitionDone(mirrorEl, function () {
                mirrorEl.style.transition = '';
                callback();
            });
        };
        ElementMirror.prototype.cleanup = function () {
            if (this.mirrorEl) {
                removeElement(this.mirrorEl);
                this.mirrorEl = null;
            }
            this.sourceEl = null;
        };
        ElementMirror.prototype.updateElPosition = function () {
            if (this.sourceEl && this.isVisible) {
                applyStyle(this.getMirrorEl(), {
                    left: this.sourceElRect.left + this.deltaX,
                    top: this.sourceElRect.top + this.deltaY
                });
            }
        };
        ElementMirror.prototype.getMirrorEl = function () {
            var sourceElRect = this.sourceElRect;
            var mirrorEl = this.mirrorEl;
            if (!mirrorEl) {
                mirrorEl = this.mirrorEl = this.sourceEl.cloneNode(true); // cloneChildren=true
                // we don't want long taps or any mouse interaction causing selection/menus.
                // would use preventSelection(), but that prevents selectstart, causing problems.
                mirrorEl.classList.add('fc-unselectable');
                mirrorEl.classList.add('fc-event-dragging');
                applyStyle(mirrorEl, {
                    position: 'fixed',
                    zIndex: this.zIndex,
                    visibility: '',
                    boxSizing: 'border-box',
                    width: sourceElRect.right - sourceElRect.left,
                    height: sourceElRect.bottom - sourceElRect.top,
                    right: 'auto',
                    bottom: 'auto',
                    margin: 0
                });
                this.parentNode.appendChild(mirrorEl);
            }
            return mirrorEl;
        };
        return ElementMirror;
    }());

    /*
    Is a cache for a given element's scroll information (all the info that ScrollController stores)
    in addition the "client rectangle" of the element.. the area within the scrollbars.

    The cache can be in one of two modes:
    - doesListening:false - ignores when the container is scrolled by someone else
    - doesListening:true - watch for scrolling and update the cache
    */
    var ScrollGeomCache = /** @class */ (function (_super) {
        __extends(ScrollGeomCache, _super);
        function ScrollGeomCache(scrollController, doesListening) {
            var _this = _super.call(this) || this;
            _this.handleScroll = function () {
                _this.scrollTop = _this.scrollController.getScrollTop();
                _this.scrollLeft = _this.scrollController.getScrollLeft();
                _this.handleScrollChange();
            };
            _this.scrollController = scrollController;
            _this.doesListening = doesListening;
            _this.scrollTop = _this.origScrollTop = scrollController.getScrollTop();
            _this.scrollLeft = _this.origScrollLeft = scrollController.getScrollLeft();
            _this.scrollWidth = scrollController.getScrollWidth();
            _this.scrollHeight = scrollController.getScrollHeight();
            _this.clientWidth = scrollController.getClientWidth();
            _this.clientHeight = scrollController.getClientHeight();
            _this.clientRect = _this.computeClientRect(); // do last in case it needs cached values
            if (_this.doesListening) {
                _this.getEventTarget().addEventListener('scroll', _this.handleScroll);
            }
            return _this;
        }
        ScrollGeomCache.prototype.destroy = function () {
            if (this.doesListening) {
                this.getEventTarget().removeEventListener('scroll', this.handleScroll);
            }
        };
        ScrollGeomCache.prototype.getScrollTop = function () {
            return this.scrollTop;
        };
        ScrollGeomCache.prototype.getScrollLeft = function () {
            return this.scrollLeft;
        };
        ScrollGeomCache.prototype.setScrollTop = function (top) {
            this.scrollController.setScrollTop(top);
            if (!this.doesListening) {
                // we are not relying on the element to normalize out-of-bounds scroll values
                // so we need to sanitize ourselves
                this.scrollTop = Math.max(Math.min(top, this.getMaxScrollTop()), 0);
                this.handleScrollChange();
            }
        };
        ScrollGeomCache.prototype.setScrollLeft = function (top) {
            this.scrollController.setScrollLeft(top);
            if (!this.doesListening) {
                // we are not relying on the element to normalize out-of-bounds scroll values
                // so we need to sanitize ourselves
                this.scrollLeft = Math.max(Math.min(top, this.getMaxScrollLeft()), 0);
                this.handleScrollChange();
            }
        };
        ScrollGeomCache.prototype.getClientWidth = function () {
            return this.clientWidth;
        };
        ScrollGeomCache.prototype.getClientHeight = function () {
            return this.clientHeight;
        };
        ScrollGeomCache.prototype.getScrollWidth = function () {
            return this.scrollWidth;
        };
        ScrollGeomCache.prototype.getScrollHeight = function () {
            return this.scrollHeight;
        };
        ScrollGeomCache.prototype.handleScrollChange = function () {
        };
        return ScrollGeomCache;
    }(ScrollController));
    var ElementScrollGeomCache = /** @class */ (function (_super) {
        __extends(ElementScrollGeomCache, _super);
        function ElementScrollGeomCache(el, doesListening) {
            return _super.call(this, new ElementScrollController(el), doesListening) || this;
        }
        ElementScrollGeomCache.prototype.getEventTarget = function () {
            return this.scrollController.el;
        };
        ElementScrollGeomCache.prototype.computeClientRect = function () {
            return computeInnerRect(this.scrollController.el);
        };
        return ElementScrollGeomCache;
    }(ScrollGeomCache));
    var WindowScrollGeomCache = /** @class */ (function (_super) {
        __extends(WindowScrollGeomCache, _super);
        function WindowScrollGeomCache(doesListening) {
            return _super.call(this, new WindowScrollController(), doesListening) || this;
        }
        WindowScrollGeomCache.prototype.getEventTarget = function () {
            return window;
        };
        WindowScrollGeomCache.prototype.computeClientRect = function () {
            return {
                left: this.scrollLeft,
                right: this.scrollLeft + this.clientWidth,
                top: this.scrollTop,
                bottom: this.scrollTop + this.clientHeight
            };
        };
        // the window is the only scroll object that changes it's rectangle relative
        // to the document's topleft as it scrolls
        WindowScrollGeomCache.prototype.handleScrollChange = function () {
            this.clientRect = this.computeClientRect();
        };
        return WindowScrollGeomCache;
    }(ScrollGeomCache));

    // If available we are using native "performance" API instead of "Date"
    // Read more about it on MDN:
    // https://developer.mozilla.org/en-US/docs/Web/API/Performance
    var getTime = typeof performance === 'function' ? performance.now : Date.now;
    /*
    For a pointer interaction, automatically scrolls certain scroll containers when the pointer
    approaches the edge.

    The caller must call start + handleMove + stop.
    */
    var AutoScroller = /** @class */ (function () {
        function AutoScroller() {
            var _this = this;
            // options that can be set by caller
            this.isEnabled = true;
            this.scrollQuery = [window, '.fc-scroller'];
            this.edgeThreshold = 50; // pixels
            this.maxVelocity = 300; // pixels per second
            // internal state
            this.pointerScreenX = null;
            this.pointerScreenY = null;
            this.isAnimating = false;
            this.scrollCaches = null;
            // protect against the initial pointerdown being too close to an edge and starting the scroll
            this.everMovedUp = false;
            this.everMovedDown = false;
            this.everMovedLeft = false;
            this.everMovedRight = false;
            this.animate = function () {
                if (_this.isAnimating) { // wasn't cancelled between animation calls
                    var edge = _this.computeBestEdge(_this.pointerScreenX + window.pageXOffset, _this.pointerScreenY + window.pageYOffset);
                    if (edge) {
                        var now = getTime();
                        _this.handleSide(edge, (now - _this.msSinceRequest) / 1000);
                        _this.requestAnimation(now);
                    }
                    else {
                        _this.isAnimating = false; // will stop animation
                    }
                }
            };
        }
        AutoScroller.prototype.start = function (pageX, pageY) {
            if (this.isEnabled) {
                this.scrollCaches = this.buildCaches();
                this.pointerScreenX = null;
                this.pointerScreenY = null;
                this.everMovedUp = false;
                this.everMovedDown = false;
                this.everMovedLeft = false;
                this.everMovedRight = false;
                this.handleMove(pageX, pageY);
            }
        };
        AutoScroller.prototype.handleMove = function (pageX, pageY) {
            if (this.isEnabled) {
                var pointerScreenX = pageX - window.pageXOffset;
                var pointerScreenY = pageY - window.pageYOffset;
                var yDelta = this.pointerScreenY === null ? 0 : pointerScreenY - this.pointerScreenY;
                var xDelta = this.pointerScreenX === null ? 0 : pointerScreenX - this.pointerScreenX;
                if (yDelta < 0) {
                    this.everMovedUp = true;
                }
                else if (yDelta > 0) {
                    this.everMovedDown = true;
                }
                if (xDelta < 0) {
                    this.everMovedLeft = true;
                }
                else if (xDelta > 0) {
                    this.everMovedRight = true;
                }
                this.pointerScreenX = pointerScreenX;
                this.pointerScreenY = pointerScreenY;
                if (!this.isAnimating) {
                    this.isAnimating = true;
                    this.requestAnimation(getTime());
                }
            }
        };
        AutoScroller.prototype.stop = function () {
            if (this.isEnabled) {
                this.isAnimating = false; // will stop animation
                for (var _i = 0, _a = this.scrollCaches; _i < _a.length; _i++) {
                    var scrollCache = _a[_i];
                    scrollCache.destroy();
                }
                this.scrollCaches = null;
            }
        };
        AutoScroller.prototype.requestAnimation = function (now) {
            this.msSinceRequest = now;
            requestAnimationFrame(this.animate);
        };
        AutoScroller.prototype.handleSide = function (edge, seconds) {
            var scrollCache = edge.scrollCache;
            var edgeThreshold = this.edgeThreshold;
            var invDistance = edgeThreshold - edge.distance;
            var velocity = // the closer to the edge, the faster we scroll
             (invDistance * invDistance) / (edgeThreshold * edgeThreshold) * // quadratic
                this.maxVelocity * seconds;
            var sign = 1;
            switch (edge.name) {
                case 'left':
                    sign = -1;
                // falls through
                case 'right':
                    scrollCache.setScrollLeft(scrollCache.getScrollLeft() + velocity * sign);
                    break;
                case 'top':
                    sign = -1;
                // falls through
                case 'bottom':
                    scrollCache.setScrollTop(scrollCache.getScrollTop() + velocity * sign);
                    break;
            }
        };
        // left/top are relative to document topleft
        AutoScroller.prototype.computeBestEdge = function (left, top) {
            var edgeThreshold = this.edgeThreshold;
            var bestSide = null;
            for (var _i = 0, _a = this.scrollCaches; _i < _a.length; _i++) {
                var scrollCache = _a[_i];
                var rect = scrollCache.clientRect;
                var leftDist = left - rect.left;
                var rightDist = rect.right - left;
                var topDist = top - rect.top;
                var bottomDist = rect.bottom - top;
                // completely within the rect?
                if (leftDist >= 0 && rightDist >= 0 && topDist >= 0 && bottomDist >= 0) {
                    if (topDist <= edgeThreshold && this.everMovedUp && scrollCache.canScrollUp() &&
                        (!bestSide || bestSide.distance > topDist)) {
                        bestSide = { scrollCache: scrollCache, name: 'top', distance: topDist };
                    }
                    if (bottomDist <= edgeThreshold && this.everMovedDown && scrollCache.canScrollDown() &&
                        (!bestSide || bestSide.distance > bottomDist)) {
                        bestSide = { scrollCache: scrollCache, name: 'bottom', distance: bottomDist };
                    }
                    if (leftDist <= edgeThreshold && this.everMovedLeft && scrollCache.canScrollLeft() &&
                        (!bestSide || bestSide.distance > leftDist)) {
                        bestSide = { scrollCache: scrollCache, name: 'left', distance: leftDist };
                    }
                    if (rightDist <= edgeThreshold && this.everMovedRight && scrollCache.canScrollRight() &&
                        (!bestSide || bestSide.distance > rightDist)) {
                        bestSide = { scrollCache: scrollCache, name: 'right', distance: rightDist };
                    }
                }
            }
            return bestSide;
        };
        AutoScroller.prototype.buildCaches = function () {
            return this.queryScrollEls().map(function (el) {
                if (el === window) {
                    return new WindowScrollGeomCache(false); // false = don't listen to user-generated scrolls
                }
                else {
                    return new ElementScrollGeomCache(el, false); // false = don't listen to user-generated scrolls
                }
            });
        };
        AutoScroller.prototype.queryScrollEls = function () {
            var els = [];
            for (var _i = 0, _a = this.scrollQuery; _i < _a.length; _i++) {
                var query = _a[_i];
                if (typeof query === 'object') {
                    els.push(query);
                }
                else {
                    els.push.apply(els, Array.prototype.slice.call(document.querySelectorAll(query)));
                }
            }
            return els;
        };
        return AutoScroller;
    }());

    /*
    Monitors dragging on an element. Has a number of high-level features:
    - minimum distance required before dragging
    - minimum wait time ("delay") before dragging
    - a mirror element that follows the pointer
    */
    var FeaturefulElementDragging = /** @class */ (function (_super) {
        __extends(FeaturefulElementDragging, _super);
        function FeaturefulElementDragging(containerEl) {
            var _this = _super.call(this, containerEl) || this;
            // options that can be directly set by caller
            // the caller can also set the PointerDragging's options as well
            _this.delay = null;
            _this.minDistance = 0;
            _this.touchScrollAllowed = true; // prevents drag from starting and blocks scrolling during drag
            _this.mirrorNeedsRevert = false;
            _this.isInteracting = false; // is the user validly moving the pointer? lasts until pointerup
            _this.isDragging = false; // is it INTENTFULLY dragging? lasts until after revert animation
            _this.isDelayEnded = false;
            _this.isDistanceSurpassed = false;
            _this.delayTimeoutId = null;
            _this.onPointerDown = function (ev) {
                if (!_this.isDragging) { // so new drag doesn't happen while revert animation is going
                    _this.isInteracting = true;
                    _this.isDelayEnded = false;
                    _this.isDistanceSurpassed = false;
                    preventSelection(document.body);
                    preventContextMenu(document.body);
                    // prevent links from being visited if there's an eventual drag.
                    // also prevents selection in older browsers (maybe?).
                    // not necessary for touch, besides, browser would complain about passiveness.
                    if (!ev.isTouch) {
                        ev.origEvent.preventDefault();
                    }
                    _this.emitter.trigger('pointerdown', ev);
                    if (_this.isInteracting && // not destroyed via pointerdown handler
                        !_this.pointer.shouldIgnoreMove) {
                        // actions related to initiating dragstart+dragmove+dragend...
                        _this.mirror.setIsVisible(false); // reset. caller must set-visible
                        _this.mirror.start(ev.subjectEl, ev.pageX, ev.pageY); // must happen on first pointer down
                        _this.startDelay(ev);
                        if (!_this.minDistance) {
                            _this.handleDistanceSurpassed(ev);
                        }
                    }
                }
            };
            _this.onPointerMove = function (ev) {
                if (_this.isInteracting) {
                    _this.emitter.trigger('pointermove', ev);
                    if (!_this.isDistanceSurpassed) {
                        var minDistance = _this.minDistance;
                        var distanceSq = void 0; // current distance from the origin, squared
                        var deltaX = ev.deltaX, deltaY = ev.deltaY;
                        distanceSq = deltaX * deltaX + deltaY * deltaY;
                        if (distanceSq >= minDistance * minDistance) { // use pythagorean theorem
                            _this.handleDistanceSurpassed(ev);
                        }
                    }
                    if (_this.isDragging) {
                        // a real pointer move? (not one simulated by scrolling)
                        if (ev.origEvent.type !== 'scroll') {
                            _this.mirror.handleMove(ev.pageX, ev.pageY);
                            _this.autoScroller.handleMove(ev.pageX, ev.pageY);
                        }
                        _this.emitter.trigger('dragmove', ev);
                    }
                }
            };
            _this.onPointerUp = function (ev) {
                if (_this.isInteracting) {
                    _this.isInteracting = false;
                    allowSelection(document.body);
                    allowContextMenu(document.body);
                    _this.emitter.trigger('pointerup', ev); // can potentially set mirrorNeedsRevert
                    if (_this.isDragging) {
                        _this.autoScroller.stop();
                        _this.tryStopDrag(ev); // which will stop the mirror
                    }
                    if (_this.delayTimeoutId) {
                        clearTimeout(_this.delayTimeoutId);
                        _this.delayTimeoutId = null;
                    }
                }
            };
            var pointer = _this.pointer = new PointerDragging(containerEl);
            pointer.emitter.on('pointerdown', _this.onPointerDown);
            pointer.emitter.on('pointermove', _this.onPointerMove);
            pointer.emitter.on('pointerup', _this.onPointerUp);
            _this.mirror = new ElementMirror();
            _this.autoScroller = new AutoScroller();
            return _this;
        }
        FeaturefulElementDragging.prototype.destroy = function () {
            this.pointer.destroy();
            // HACK: simulate a pointer-up to end the current drag
            // TODO: fire 'dragend' directly and stop interaction. discourage use of pointerup event (b/c might not fire)
            this.onPointerUp({});
        };
        FeaturefulElementDragging.prototype.startDelay = function (ev) {
            var _this = this;
            if (typeof this.delay === 'number') {
                this.delayTimeoutId = setTimeout(function () {
                    _this.delayTimeoutId = null;
                    _this.handleDelayEnd(ev);
                }, this.delay); // not assignable to number!
            }
            else {
                this.handleDelayEnd(ev);
            }
        };
        FeaturefulElementDragging.prototype.handleDelayEnd = function (ev) {
            this.isDelayEnded = true;
            this.tryStartDrag(ev);
        };
        FeaturefulElementDragging.prototype.handleDistanceSurpassed = function (ev) {
            this.isDistanceSurpassed = true;
            this.tryStartDrag(ev);
        };
        FeaturefulElementDragging.prototype.tryStartDrag = function (ev) {
            if (this.isDelayEnded && this.isDistanceSurpassed) {
                if (!this.pointer.wasTouchScroll || this.touchScrollAllowed) {
                    this.isDragging = true;
                    this.mirrorNeedsRevert = false;
                    this.autoScroller.start(ev.pageX, ev.pageY);
                    this.emitter.trigger('dragstart', ev);
                    if (this.touchScrollAllowed === false) {
                        this.pointer.cancelTouchScroll();
                    }
                }
            }
        };
        FeaturefulElementDragging.prototype.tryStopDrag = function (ev) {
            // .stop() is ALWAYS asynchronous, which we NEED because we want all pointerup events
            // that come from the document to fire beforehand. much more convenient this way.
            this.mirror.stop(this.mirrorNeedsRevert, this.stopDrag.bind(this, ev) // bound with args
            );
        };
        FeaturefulElementDragging.prototype.stopDrag = function (ev) {
            this.isDragging = false;
            this.emitter.trigger('dragend', ev);
        };
        // fill in the implementations...
        FeaturefulElementDragging.prototype.setIgnoreMove = function (bool) {
            this.pointer.shouldIgnoreMove = bool;
        };
        FeaturefulElementDragging.prototype.setMirrorIsVisible = function (bool) {
            this.mirror.setIsVisible(bool);
        };
        FeaturefulElementDragging.prototype.setMirrorNeedsRevert = function (bool) {
            this.mirrorNeedsRevert = bool;
        };
        FeaturefulElementDragging.prototype.setAutoScrollEnabled = function (bool) {
            this.autoScroller.isEnabled = bool;
        };
        return FeaturefulElementDragging;
    }(ElementDragging));

    /*
    When this class is instantiated, it records the offset of an element (relative to the document topleft),
    and continues to monitor scrolling, updating the cached coordinates if it needs to.
    Does not access the DOM after instantiation, so highly performant.

    Also keeps track of all scrolling/overflow:hidden containers that are parents of the given element
    and an determine if a given point is inside the combined clipping rectangle.
    */
    var OffsetTracker = /** @class */ (function () {
        function OffsetTracker(el) {
            this.origRect = computeRect(el);
            // will work fine for divs that have overflow:hidden
            this.scrollCaches = getClippingParents(el).map(function (el) {
                return new ElementScrollGeomCache(el, true); // listen=true
            });
        }
        OffsetTracker.prototype.destroy = function () {
            for (var _i = 0, _a = this.scrollCaches; _i < _a.length; _i++) {
                var scrollCache = _a[_i];
                scrollCache.destroy();
            }
        };
        OffsetTracker.prototype.computeLeft = function () {
            var left = this.origRect.left;
            for (var _i = 0, _a = this.scrollCaches; _i < _a.length; _i++) {
                var scrollCache = _a[_i];
                left += scrollCache.origScrollLeft - scrollCache.getScrollLeft();
            }
            return left;
        };
        OffsetTracker.prototype.computeTop = function () {
            var top = this.origRect.top;
            for (var _i = 0, _a = this.scrollCaches; _i < _a.length; _i++) {
                var scrollCache = _a[_i];
                top += scrollCache.origScrollTop - scrollCache.getScrollTop();
            }
            return top;
        };
        OffsetTracker.prototype.isWithinClipping = function (pageX, pageY) {
            var point = { left: pageX, top: pageY };
            for (var _i = 0, _a = this.scrollCaches; _i < _a.length; _i++) {
                var scrollCache = _a[_i];
                if (!isIgnoredClipping(scrollCache.getEventTarget()) &&
                    !pointInsideRect(point, scrollCache.clientRect)) {
                    return false;
                }
            }
            return true;
        };
        return OffsetTracker;
    }());
    // certain clipping containers should never constrain interactions, like <html> and <body>
    // https://github.com/fullcalendar/fullcalendar/issues/3615
    function isIgnoredClipping(node) {
        var tagName = node.tagName;
        return tagName === 'HTML' || tagName === 'BODY';
    }

    /*
    Tracks movement over multiple droppable areas (aka "hits")
    that exist in one or more DateComponents.
    Relies on an existing draggable.

    emits:
    - pointerdown
    - dragstart
    - hitchange - fires initially, even if not over a hit
    - pointerup
    - (hitchange - again, to null, if ended over a hit)
    - dragend
    */
    var HitDragging = /** @class */ (function () {
        function HitDragging(dragging, droppableStore) {
            var _this = this;
            // options that can be set by caller
            this.useSubjectCenter = false;
            this.requireInitial = true; // if doesn't start out on a hit, won't emit any events
            this.initialHit = null;
            this.movingHit = null;
            this.finalHit = null; // won't ever be populated if shouldIgnoreMove
            this.handlePointerDown = function (ev) {
                var dragging = _this.dragging;
                _this.initialHit = null;
                _this.movingHit = null;
                _this.finalHit = null;
                _this.prepareHits();
                _this.processFirstCoord(ev);
                if (_this.initialHit || !_this.requireInitial) {
                    dragging.setIgnoreMove(false);
                    _this.emitter.trigger('pointerdown', ev); // TODO: fire this before computing processFirstCoord, so listeners can cancel. this gets fired by almost every handler :(
                }
                else {
                    dragging.setIgnoreMove(true);
                }
            };
            this.handleDragStart = function (ev) {
                _this.emitter.trigger('dragstart', ev);
                _this.handleMove(ev, true); // force = fire even if initially null
            };
            this.handleDragMove = function (ev) {
                _this.emitter.trigger('dragmove', ev);
                _this.handleMove(ev);
            };
            this.handlePointerUp = function (ev) {
                _this.releaseHits();
                _this.emitter.trigger('pointerup', ev);
            };
            this.handleDragEnd = function (ev) {
                if (_this.movingHit) {
                    _this.emitter.trigger('hitupdate', null, true, ev);
                }
                _this.finalHit = _this.movingHit;
                _this.movingHit = null;
                _this.emitter.trigger('dragend', ev);
            };
            this.droppableStore = droppableStore;
            dragging.emitter.on('pointerdown', this.handlePointerDown);
            dragging.emitter.on('dragstart', this.handleDragStart);
            dragging.emitter.on('dragmove', this.handleDragMove);
            dragging.emitter.on('pointerup', this.handlePointerUp);
            dragging.emitter.on('dragend', this.handleDragEnd);
            this.dragging = dragging;
            this.emitter = new EmitterMixin();
        }
        // sets initialHit
        // sets coordAdjust
        HitDragging.prototype.processFirstCoord = function (ev) {
            var origPoint = { left: ev.pageX, top: ev.pageY };
            var adjustedPoint = origPoint;
            var subjectEl = ev.subjectEl;
            var subjectRect;
            if (subjectEl !== document) {
                subjectRect = computeRect(subjectEl);
                adjustedPoint = constrainPoint(adjustedPoint, subjectRect);
            }
            var initialHit = this.initialHit = this.queryHitForOffset(adjustedPoint.left, adjustedPoint.top);
            if (initialHit) {
                if (this.useSubjectCenter && subjectRect) {
                    var slicedSubjectRect = intersectRects(subjectRect, initialHit.rect);
                    if (slicedSubjectRect) {
                        adjustedPoint = getRectCenter(slicedSubjectRect);
                    }
                }
                this.coordAdjust = diffPoints(adjustedPoint, origPoint);
            }
            else {
                this.coordAdjust = { left: 0, top: 0 };
            }
        };
        HitDragging.prototype.handleMove = function (ev, forceHandle) {
            var hit = this.queryHitForOffset(ev.pageX + this.coordAdjust.left, ev.pageY + this.coordAdjust.top);
            if (forceHandle || !isHitsEqual(this.movingHit, hit)) {
                this.movingHit = hit;
                this.emitter.trigger('hitupdate', hit, false, ev);
            }
        };
        HitDragging.prototype.prepareHits = function () {
            this.offsetTrackers = mapHash(this.droppableStore, function (interactionSettings) {
                interactionSettings.component.prepareHits();
                return new OffsetTracker(interactionSettings.el);
            });
        };
        HitDragging.prototype.releaseHits = function () {
            var offsetTrackers = this.offsetTrackers;
            for (var id in offsetTrackers) {
                offsetTrackers[id].destroy();
            }
            this.offsetTrackers = {};
        };
        HitDragging.prototype.queryHitForOffset = function (offsetLeft, offsetTop) {
            var _a = this, droppableStore = _a.droppableStore, offsetTrackers = _a.offsetTrackers;
            var bestHit = null;
            for (var id in droppableStore) {
                var component = droppableStore[id].component;
                var offsetTracker = offsetTrackers[id];
                if (offsetTracker && // wasn't destroyed mid-drag
                    offsetTracker.isWithinClipping(offsetLeft, offsetTop)) {
                    var originLeft = offsetTracker.computeLeft();
                    var originTop = offsetTracker.computeTop();
                    var positionLeft = offsetLeft - originLeft;
                    var positionTop = offsetTop - originTop;
                    var origRect = offsetTracker.origRect;
                    var width = origRect.right - origRect.left;
                    var height = origRect.bottom - origRect.top;
                    if (
                    // must be within the element's bounds
                    positionLeft >= 0 && positionLeft < width &&
                        positionTop >= 0 && positionTop < height) {
                        var hit = component.queryHit(positionLeft, positionTop, width, height);
                        if (hit &&
                            (
                            // make sure the hit is within activeRange, meaning it's not a deal cell
                            !component.props.dateProfile || // hack for MorePopover
                                rangeContainsRange(component.props.dateProfile.activeRange, hit.dateSpan.range)) &&
                            (!bestHit || hit.layer > bestHit.layer)) {
                            // TODO: better way to re-orient rectangle
                            hit.rect.left += originLeft;
                            hit.rect.right += originLeft;
                            hit.rect.top += originTop;
                            hit.rect.bottom += originTop;
                            bestHit = hit;
                        }
                    }
                }
            }
            return bestHit;
        };
        return HitDragging;
    }());
    function isHitsEqual(hit0, hit1) {
        if (!hit0 && !hit1) {
            return true;
        }
        if (Boolean(hit0) !== Boolean(hit1)) {
            return false;
        }
        return isDateSpansEqual(hit0.dateSpan, hit1.dateSpan);
    }

    /*
    Monitors when the user clicks on a specific date/time of a component.
    A pointerdown+pointerup on the same "hit" constitutes a click.
    */
    var DateClicking = /** @class */ (function (_super) {
        __extends(DateClicking, _super);
        function DateClicking(settings) {
            var _this = _super.call(this, settings) || this;
            _this.handlePointerDown = function (ev) {
                var dragging = _this.dragging;
                // do this in pointerdown (not dragend) because DOM might be mutated by the time dragend is fired
                dragging.setIgnoreMove(!_this.component.isValidDateDownEl(dragging.pointer.downEl));
            };
            // won't even fire if moving was ignored
            _this.handleDragEnd = function (ev) {
                var component = _this.component;
                var _a = component.context, calendar = _a.calendar, view = _a.view;
                var pointer = _this.dragging.pointer;
                if (!pointer.wasTouchScroll) {
                    var _b = _this.hitDragging, initialHit = _b.initialHit, finalHit = _b.finalHit;
                    if (initialHit && finalHit && isHitsEqual(initialHit, finalHit)) {
                        calendar.triggerDateClick(initialHit.dateSpan, initialHit.dayEl, view, ev.origEvent);
                    }
                }
            };
            // we DO want to watch pointer moves because otherwise finalHit won't get populated
            _this.dragging = new FeaturefulElementDragging(settings.el);
            _this.dragging.autoScroller.isEnabled = false;
            var hitDragging = _this.hitDragging = new HitDragging(_this.dragging, interactionSettingsToStore(settings));
            hitDragging.emitter.on('pointerdown', _this.handlePointerDown);
            hitDragging.emitter.on('dragend', _this.handleDragEnd);
            return _this;
        }
        DateClicking.prototype.destroy = function () {
            this.dragging.destroy();
        };
        return DateClicking;
    }(Interaction));

    /*
    Tracks when the user selects a portion of time of a component,
    constituted by a drag over date cells, with a possible delay at the beginning of the drag.
    */
    var DateSelecting = /** @class */ (function (_super) {
        __extends(DateSelecting, _super);
        function DateSelecting(settings) {
            var _this = _super.call(this, settings) || this;
            _this.dragSelection = null;
            _this.handlePointerDown = function (ev) {
                var _a = _this, component = _a.component, dragging = _a.dragging;
                var options = component.context.options;
                var canSelect = options.selectable &&
                    component.isValidDateDownEl(ev.origEvent.target);
                // don't bother to watch expensive moves if component won't do selection
                dragging.setIgnoreMove(!canSelect);
                // if touch, require user to hold down
                dragging.delay = ev.isTouch ? getComponentTouchDelay(component) : null;
            };
            _this.handleDragStart = function (ev) {
                _this.component.context.calendar.unselect(ev); // unselect previous selections
            };
            _this.handleHitUpdate = function (hit, isFinal) {
                var _a = _this.component.context, calendar = _a.calendar, pluginHooks = _a.pluginHooks;
                var dragSelection = null;
                var isInvalid = false;
                if (hit) {
                    dragSelection = joinHitsIntoSelection(_this.hitDragging.initialHit, hit, pluginHooks.dateSelectionTransformers);
                    if (!dragSelection || !_this.component.isDateSelectionValid(dragSelection)) {
                        isInvalid = true;
                        dragSelection = null;
                    }
                }
                if (dragSelection) {
                    calendar.dispatch({ type: 'SELECT_DATES', selection: dragSelection });
                }
                else if (!isFinal) { // only unselect if moved away while dragging
                    calendar.dispatch({ type: 'UNSELECT_DATES' });
                }
                if (!isInvalid) {
                    enableCursor();
                }
                else {
                    disableCursor();
                }
                if (!isFinal) {
                    _this.dragSelection = dragSelection; // only clear if moved away from all hits while dragging
                }
            };
            _this.handlePointerUp = function (pev) {
                if (_this.dragSelection) {
                    // selection is already rendered, so just need to report selection
                    _this.component.context.calendar.triggerDateSelect(_this.dragSelection, pev);
                    _this.dragSelection = null;
                }
            };
            var component = settings.component;
            var options = component.context.options;
            var dragging = _this.dragging = new FeaturefulElementDragging(settings.el);
            dragging.touchScrollAllowed = false;
            dragging.minDistance = options.selectMinDistance || 0;
            dragging.autoScroller.isEnabled = options.dragScroll;
            var hitDragging = _this.hitDragging = new HitDragging(_this.dragging, interactionSettingsToStore(settings));
            hitDragging.emitter.on('pointerdown', _this.handlePointerDown);
            hitDragging.emitter.on('dragstart', _this.handleDragStart);
            hitDragging.emitter.on('hitupdate', _this.handleHitUpdate);
            hitDragging.emitter.on('pointerup', _this.handlePointerUp);
            return _this;
        }
        DateSelecting.prototype.destroy = function () {
            this.dragging.destroy();
        };
        return DateSelecting;
    }(Interaction));
    function getComponentTouchDelay(component) {
        var options = component.context.options;
        var delay = options.selectLongPressDelay;
        if (delay == null) {
            delay = options.longPressDelay;
        }
        return delay;
    }
    function joinHitsIntoSelection(hit0, hit1, dateSelectionTransformers) {
        var dateSpan0 = hit0.dateSpan;
        var dateSpan1 = hit1.dateSpan;
        var ms = [
            dateSpan0.range.start,
            dateSpan0.range.end,
            dateSpan1.range.start,
            dateSpan1.range.end
        ];
        ms.sort(compareNumbers);
        var props = {};
        for (var _i = 0, dateSelectionTransformers_1 = dateSelectionTransformers; _i < dateSelectionTransformers_1.length; _i++) {
            var transformer = dateSelectionTransformers_1[_i];
            var res = transformer(hit0, hit1);
            if (res === false) {
                return null;
            }
            else if (res) {
                __assign(props, res);
            }
        }
        props.range = { start: ms[0], end: ms[3] };
        props.allDay = dateSpan0.allDay;
        return props;
    }

    var EventDragging = /** @class */ (function (_super) {
        __extends(EventDragging, _super);
        function EventDragging(settings) {
            var _this = _super.call(this, settings) || this;
            // internal state
            _this.subjectEl = null;
            _this.subjectSeg = null; // the seg being selected/dragged
            _this.isDragging = false;
            _this.eventRange = null;
            _this.relevantEvents = null; // the events being dragged
            _this.receivingCalendar = null;
            _this.validMutation = null;
            _this.mutatedRelevantEvents = null;
            _this.handlePointerDown = function (ev) {
                var origTarget = ev.origEvent.target;
                var _a = _this, component = _a.component, dragging = _a.dragging;
                var mirror = dragging.mirror;
                var options = component.context.options;
                var initialCalendar = component.context.calendar;
                _this.subjectEl = ev.subjectEl;
                var subjectSeg = _this.subjectSeg = getElSeg(ev.subjectEl);
                var eventRange = _this.eventRange = subjectSeg.eventRange;
                var eventInstanceId = eventRange.instance.instanceId;
                _this.relevantEvents = getRelevantEvents(initialCalendar.state.eventStore, eventInstanceId);
                dragging.minDistance = ev.isTouch ? 0 : options.eventDragMinDistance;
                dragging.delay =
                    // only do a touch delay if touch and this event hasn't been selected yet
                    (ev.isTouch && eventInstanceId !== component.props.eventSelection) ?
                        getComponentTouchDelay$1(component) :
                        null;
                mirror.parentNode = initialCalendar.el;
                mirror.revertDuration = options.dragRevertDuration;
                var isValid = component.isValidSegDownEl(origTarget) &&
                    !elementClosest(origTarget, '.fc-event-resizer'); // NOT on a resizer
                dragging.setIgnoreMove(!isValid);
                // disable dragging for elements that are resizable (ie, selectable)
                // but are not draggable
                _this.isDragging = isValid &&
                    ev.subjectEl.classList.contains('fc-event-draggable');
            };
            _this.handleDragStart = function (ev) {
                var context = _this.component.context;
                var initialCalendar = context.calendar;
                var eventRange = _this.eventRange;
                var eventInstanceId = eventRange.instance.instanceId;
                if (ev.isTouch) {
                    // need to select a different event?
                    if (eventInstanceId !== _this.component.props.eventSelection) {
                        initialCalendar.dispatch({ type: 'SELECT_EVENT', eventInstanceId: eventInstanceId });
                    }
                }
                else {
                    // if now using mouse, but was previous touch interaction, clear selected event
                    initialCalendar.dispatch({ type: 'UNSELECT_EVENT' });
                }
                if (_this.isDragging) {
                    initialCalendar.unselect(ev); // unselect *date* selection
                    initialCalendar.publiclyTrigger('eventDragStart', [
                        {
                            el: _this.subjectEl,
                            event: new EventApi(initialCalendar, eventRange.def, eventRange.instance),
                            jsEvent: ev.origEvent,
                            view: context.view
                        }
                    ]);
                }
            };
            _this.handleHitUpdate = function (hit, isFinal) {
                if (!_this.isDragging) {
                    return;
                }
                var relevantEvents = _this.relevantEvents;
                var initialHit = _this.hitDragging.initialHit;
                var initialCalendar = _this.component.context.calendar;
                // states based on new hit
                var receivingCalendar = null;
                var mutation = null;
                var mutatedRelevantEvents = null;
                var isInvalid = false;
                var interaction = {
                    affectedEvents: relevantEvents,
                    mutatedEvents: createEmptyEventStore(),
                    isEvent: true
                };
                if (hit) {
                    var receivingComponent = hit.component;
                    receivingCalendar = receivingComponent.context.calendar;
                    var receivingOptions = receivingComponent.context.options;
                    if (initialCalendar === receivingCalendar ||
                        receivingOptions.editable && receivingOptions.droppable) {
                        mutation = computeEventMutation(initialHit, hit, receivingCalendar.pluginSystem.hooks.eventDragMutationMassagers);
                        if (mutation) {
                            mutatedRelevantEvents = applyMutationToEventStore(relevantEvents, receivingCalendar.eventUiBases, mutation, receivingCalendar);
                            interaction.mutatedEvents = mutatedRelevantEvents;
                            if (!receivingComponent.isInteractionValid(interaction)) {
                                isInvalid = true;
                                mutation = null;
                                mutatedRelevantEvents = null;
                                interaction.mutatedEvents = createEmptyEventStore();
                            }
                        }
                    }
                    else {
                        receivingCalendar = null;
                    }
                }
                _this.displayDrag(receivingCalendar, interaction);
                if (!isInvalid) {
                    enableCursor();
                }
                else {
                    disableCursor();
                }
                if (!isFinal) {
                    if (initialCalendar === receivingCalendar && // TODO: write test for this
                        isHitsEqual(initialHit, hit)) {
                        mutation = null;
                    }
                    _this.dragging.setMirrorNeedsRevert(!mutation);
                    // render the mirror if no already-rendered mirror
                    // TODO: wish we could somehow wait for dispatch to guarantee render
                    _this.dragging.setMirrorIsVisible(!hit || !document.querySelector('.fc-event-mirror'));
                    // assign states based on new hit
                    _this.receivingCalendar = receivingCalendar;
                    _this.validMutation = mutation;
                    _this.mutatedRelevantEvents = mutatedRelevantEvents;
                }
            };
            _this.handlePointerUp = function () {
                if (!_this.isDragging) {
                    _this.cleanup(); // because handleDragEnd won't fire
                }
            };
            _this.handleDragEnd = function (ev) {
                if (_this.isDragging) {
                    var context = _this.component.context;
                    var initialCalendar_1 = context.calendar;
                    var initialView = context.view;
                    var _a = _this, receivingCalendar = _a.receivingCalendar, validMutation = _a.validMutation;
                    var eventDef = _this.eventRange.def;
                    var eventInstance = _this.eventRange.instance;
                    var eventApi = new EventApi(initialCalendar_1, eventDef, eventInstance);
                    var relevantEvents_1 = _this.relevantEvents;
                    var mutatedRelevantEvents = _this.mutatedRelevantEvents;
                    var finalHit = _this.hitDragging.finalHit;
                    _this.clearDrag(); // must happen after revert animation
                    initialCalendar_1.publiclyTrigger('eventDragStop', [
                        {
                            el: _this.subjectEl,
                            event: eventApi,
                            jsEvent: ev.origEvent,
                            view: initialView
                        }
                    ]);
                    if (validMutation) {
                        // dropped within same calendar
                        if (receivingCalendar === initialCalendar_1) {
                            initialCalendar_1.dispatch({
                                type: 'MERGE_EVENTS',
                                eventStore: mutatedRelevantEvents
                            });
                            var transformed = {};
                            for (var _i = 0, _b = initialCalendar_1.pluginSystem.hooks.eventDropTransformers; _i < _b.length; _i++) {
                                var transformer = _b[_i];
                                __assign(transformed, transformer(validMutation, initialCalendar_1));
                            }
                            var eventDropArg = __assign(__assign({}, transformed), { el: ev.subjectEl, delta: validMutation.datesDelta, oldEvent: eventApi, event: new EventApi(// the data AFTER the mutation
                                initialCalendar_1, mutatedRelevantEvents.defs[eventDef.defId], eventInstance ? mutatedRelevantEvents.instances[eventInstance.instanceId] : null), revert: function () {
                                    initialCalendar_1.dispatch({
                                        type: 'MERGE_EVENTS',
                                        eventStore: relevantEvents_1
                                    });
                                }, jsEvent: ev.origEvent, view: initialView });
                            initialCalendar_1.publiclyTrigger('eventDrop', [eventDropArg]);
                            // dropped in different calendar
                        }
                        else if (receivingCalendar) {
                            initialCalendar_1.publiclyTrigger('eventLeave', [
                                {
                                    draggedEl: ev.subjectEl,
                                    event: eventApi,
                                    view: initialView
                                }
                            ]);
                            initialCalendar_1.dispatch({
                                type: 'REMOVE_EVENT_INSTANCES',
                                instances: _this.mutatedRelevantEvents.instances
                            });
                            receivingCalendar.dispatch({
                                type: 'MERGE_EVENTS',
                                eventStore: _this.mutatedRelevantEvents
                            });
                            if (ev.isTouch) {
                                receivingCalendar.dispatch({
                                    type: 'SELECT_EVENT',
                                    eventInstanceId: eventInstance.instanceId
                                });
                            }
                            var dropArg = __assign(__assign({}, receivingCalendar.buildDatePointApi(finalHit.dateSpan)), { draggedEl: ev.subjectEl, jsEvent: ev.origEvent, view: finalHit.component.context.view });
                            receivingCalendar.publiclyTrigger('drop', [dropArg]);
                            receivingCalendar.publiclyTrigger('eventReceive', [
                                {
                                    draggedEl: ev.subjectEl,
                                    event: new EventApi(// the data AFTER the mutation
                                    receivingCalendar, mutatedRelevantEvents.defs[eventDef.defId], mutatedRelevantEvents.instances[eventInstance.instanceId]),
                                    view: finalHit.component.context.view
                                }
                            ]);
                        }
                    }
                    else {
                        initialCalendar_1.publiclyTrigger('_noEventDrop');
                    }
                }
                _this.cleanup();
            };
            var component = _this.component;
            var options = component.context.options;
            var dragging = _this.dragging = new FeaturefulElementDragging(settings.el);
            dragging.pointer.selector = EventDragging.SELECTOR;
            dragging.touchScrollAllowed = false;
            dragging.autoScroller.isEnabled = options.dragScroll;
            var hitDragging = _this.hitDragging = new HitDragging(_this.dragging, interactionSettingsStore);
            hitDragging.useSubjectCenter = settings.useEventCenter;
            hitDragging.emitter.on('pointerdown', _this.handlePointerDown);
            hitDragging.emitter.on('dragstart', _this.handleDragStart);
            hitDragging.emitter.on('hitupdate', _this.handleHitUpdate);
            hitDragging.emitter.on('pointerup', _this.handlePointerUp);
            hitDragging.emitter.on('dragend', _this.handleDragEnd);
            return _this;
        }
        EventDragging.prototype.destroy = function () {
            this.dragging.destroy();
        };
        // render a drag state on the next receivingCalendar
        EventDragging.prototype.displayDrag = function (nextCalendar, state) {
            var initialCalendar = this.component.context.calendar;
            var prevCalendar = this.receivingCalendar;
            // does the previous calendar need to be cleared?
            if (prevCalendar && prevCalendar !== nextCalendar) {
                // does the initial calendar need to be cleared?
                // if so, don't clear all the way. we still need to to hide the affectedEvents
                if (prevCalendar === initialCalendar) {
                    prevCalendar.dispatch({
                        type: 'SET_EVENT_DRAG',
                        state: {
                            affectedEvents: state.affectedEvents,
                            mutatedEvents: createEmptyEventStore(),
                            isEvent: true
                        }
                    });
                    // completely clear the old calendar if it wasn't the initial
                }
                else {
                    prevCalendar.dispatch({ type: 'UNSET_EVENT_DRAG' });
                }
            }
            if (nextCalendar) {
                nextCalendar.dispatch({ type: 'SET_EVENT_DRAG', state: state });
            }
        };
        EventDragging.prototype.clearDrag = function () {
            var initialCalendar = this.component.context.calendar;
            var receivingCalendar = this.receivingCalendar;
            if (receivingCalendar) {
                receivingCalendar.dispatch({ type: 'UNSET_EVENT_DRAG' });
            }
            // the initial calendar might have an dummy drag state from displayDrag
            if (initialCalendar !== receivingCalendar) {
                initialCalendar.dispatch({ type: 'UNSET_EVENT_DRAG' });
            }
        };
        EventDragging.prototype.cleanup = function () {
            this.subjectSeg = null;
            this.isDragging = false;
            this.eventRange = null;
            this.relevantEvents = null;
            this.receivingCalendar = null;
            this.validMutation = null;
            this.mutatedRelevantEvents = null;
        };
        // TODO: test this in IE11
        // QUESTION: why do we need it on the resizable???
        EventDragging.SELECTOR = '.fc-event-draggable, .fc-event-resizable';
        return EventDragging;
    }(Interaction));
    function computeEventMutation(hit0, hit1, massagers) {
        var dateSpan0 = hit0.dateSpan;
        var dateSpan1 = hit1.dateSpan;
        var date0 = dateSpan0.range.start;
        var date1 = dateSpan1.range.start;
        var standardProps = {};
        if (dateSpan0.allDay !== dateSpan1.allDay) {
            standardProps.allDay = dateSpan1.allDay;
            standardProps.hasEnd = hit1.component.context.options.allDayMaintainDuration;
            if (dateSpan1.allDay) {
                // means date1 is already start-of-day,
                // but date0 needs to be converted
                date0 = startOfDay(date0);
            }
        }
        var delta = diffDates(date0, date1, hit0.component.context.dateEnv, hit0.component === hit1.component ?
            hit0.component.largeUnit :
            null);
        if (delta.milliseconds) { // has hours/minutes/seconds
            standardProps.allDay = false;
        }
        var mutation = {
            datesDelta: delta,
            standardProps: standardProps
        };
        for (var _i = 0, massagers_1 = massagers; _i < massagers_1.length; _i++) {
            var massager = massagers_1[_i];
            massager(mutation, hit0, hit1);
        }
        return mutation;
    }
    function getComponentTouchDelay$1(component) {
        var options = component.context.options;
        var delay = options.eventLongPressDelay;
        if (delay == null) {
            delay = options.longPressDelay;
        }
        return delay;
    }

    var EventDragging$1 = /** @class */ (function (_super) {
        __extends(EventDragging, _super);
        function EventDragging(settings) {
            var _this = _super.call(this, settings) || this;
            // internal state
            _this.draggingSegEl = null;
            _this.draggingSeg = null; // TODO: rename to resizingSeg? subjectSeg?
            _this.eventRange = null;
            _this.relevantEvents = null;
            _this.validMutation = null;
            _this.mutatedRelevantEvents = null;
            _this.handlePointerDown = function (ev) {
                var component = _this.component;
                var segEl = _this.querySegEl(ev);
                var seg = getElSeg(segEl);
                var eventRange = _this.eventRange = seg.eventRange;
                _this.dragging.minDistance = component.context.options.eventDragMinDistance;
                // if touch, need to be working with a selected event
                _this.dragging.setIgnoreMove(!_this.component.isValidSegDownEl(ev.origEvent.target) ||
                    (ev.isTouch && _this.component.props.eventSelection !== eventRange.instance.instanceId));
            };
            _this.handleDragStart = function (ev) {
                var _a = _this.component.context, calendar = _a.calendar, view = _a.view;
                var eventRange = _this.eventRange;
                _this.relevantEvents = getRelevantEvents(calendar.state.eventStore, _this.eventRange.instance.instanceId);
                var segEl = _this.querySegEl(ev);
                _this.draggingSegEl = segEl;
                _this.draggingSeg = getElSeg(segEl);
                calendar.unselect();
                calendar.publiclyTrigger('eventResizeStart', [
                    {
                        el: segEl,
                        event: new EventApi(calendar, eventRange.def, eventRange.instance),
                        jsEvent: ev.origEvent,
                        view: view
                    }
                ]);
            };
            _this.handleHitUpdate = function (hit, isFinal, ev) {
                var _a = _this.component.context, calendar = _a.calendar, pluginHooks = _a.pluginHooks;
                var relevantEvents = _this.relevantEvents;
                var initialHit = _this.hitDragging.initialHit;
                var eventInstance = _this.eventRange.instance;
                var mutation = null;
                var mutatedRelevantEvents = null;
                var isInvalid = false;
                var interaction = {
                    affectedEvents: relevantEvents,
                    mutatedEvents: createEmptyEventStore(),
                    isEvent: true
                };
                if (hit) {
                    mutation = computeMutation(initialHit, hit, ev.subjectEl.classList.contains('fc-event-resizer-start'), eventInstance.range, pluginHooks.eventResizeJoinTransforms);
                }
                if (mutation) {
                    mutatedRelevantEvents = applyMutationToEventStore(relevantEvents, calendar.eventUiBases, mutation, calendar);
                    interaction.mutatedEvents = mutatedRelevantEvents;
                    if (!_this.component.isInteractionValid(interaction)) {
                        isInvalid = true;
                        mutation = null;
                        mutatedRelevantEvents = null;
                        interaction.mutatedEvents = null;
                    }
                }
                if (mutatedRelevantEvents) {
                    calendar.dispatch({
                        type: 'SET_EVENT_RESIZE',
                        state: interaction
                    });
                }
                else {
                    calendar.dispatch({ type: 'UNSET_EVENT_RESIZE' });
                }
                if (!isInvalid) {
                    enableCursor();
                }
                else {
                    disableCursor();
                }
                if (!isFinal) {
                    if (mutation && isHitsEqual(initialHit, hit)) {
                        mutation = null;
                    }
                    _this.validMutation = mutation;
                    _this.mutatedRelevantEvents = mutatedRelevantEvents;
                }
            };
            _this.handleDragEnd = function (ev) {
                var _a = _this.component.context, calendar = _a.calendar, view = _a.view;
                var eventDef = _this.eventRange.def;
                var eventInstance = _this.eventRange.instance;
                var eventApi = new EventApi(calendar, eventDef, eventInstance);
                var relevantEvents = _this.relevantEvents;
                var mutatedRelevantEvents = _this.mutatedRelevantEvents;
                calendar.publiclyTrigger('eventResizeStop', [
                    {
                        el: _this.draggingSegEl,
                        event: eventApi,
                        jsEvent: ev.origEvent,
                        view: view
                    }
                ]);
                if (_this.validMutation) {
                    calendar.dispatch({
                        type: 'MERGE_EVENTS',
                        eventStore: mutatedRelevantEvents
                    });
                    calendar.publiclyTrigger('eventResize', [
                        {
                            el: _this.draggingSegEl,
                            startDelta: _this.validMutation.startDelta || createDuration(0),
                            endDelta: _this.validMutation.endDelta || createDuration(0),
                            prevEvent: eventApi,
                            event: new EventApi(// the data AFTER the mutation
                            calendar, mutatedRelevantEvents.defs[eventDef.defId], eventInstance ? mutatedRelevantEvents.instances[eventInstance.instanceId] : null),
                            revert: function () {
                                calendar.dispatch({
                                    type: 'MERGE_EVENTS',
                                    eventStore: relevantEvents
                                });
                            },
                            jsEvent: ev.origEvent,
                            view: view
                        }
                    ]);
                }
                else {
                    calendar.publiclyTrigger('_noEventResize');
                }
                // reset all internal state
                _this.draggingSeg = null;
                _this.relevantEvents = null;
                _this.validMutation = null;
                // okay to keep eventInstance around. useful to set it in handlePointerDown
            };
            var component = settings.component;
            var dragging = _this.dragging = new FeaturefulElementDragging(settings.el);
            dragging.pointer.selector = '.fc-event-resizer';
            dragging.touchScrollAllowed = false;
            dragging.autoScroller.isEnabled = component.context.options.dragScroll;
            var hitDragging = _this.hitDragging = new HitDragging(_this.dragging, interactionSettingsToStore(settings));
            hitDragging.emitter.on('pointerdown', _this.handlePointerDown);
            hitDragging.emitter.on('dragstart', _this.handleDragStart);
            hitDragging.emitter.on('hitupdate', _this.handleHitUpdate);
            hitDragging.emitter.on('dragend', _this.handleDragEnd);
            return _this;
        }
        EventDragging.prototype.destroy = function () {
            this.dragging.destroy();
        };
        EventDragging.prototype.querySegEl = function (ev) {
            return elementClosest(ev.subjectEl, '.fc-event');
        };
        return EventDragging;
    }(Interaction));
    function computeMutation(hit0, hit1, isFromStart, instanceRange, transforms) {
        var dateEnv = hit0.component.context.dateEnv;
        var date0 = hit0.dateSpan.range.start;
        var date1 = hit1.dateSpan.range.start;
        var delta = diffDates(date0, date1, dateEnv, hit0.component.largeUnit);
        var props = {};
        for (var _i = 0, transforms_1 = transforms; _i < transforms_1.length; _i++) {
            var transform = transforms_1[_i];
            var res = transform(hit0, hit1);
            if (res === false) {
                return null;
            }
            else if (res) {
                __assign(props, res);
            }
        }
        if (isFromStart) {
            if (dateEnv.add(instanceRange.start, delta) < instanceRange.end) {
                props.startDelta = delta;
                return props;
            }
        }
        else {
            if (dateEnv.add(instanceRange.end, delta) > instanceRange.start) {
                props.endDelta = delta;
                return props;
            }
        }
        return null;
    }

    var UnselectAuto = /** @class */ (function () {
        function UnselectAuto(calendar) {
            var _this = this;
            this.isRecentPointerDateSelect = false; // wish we could use a selector to detect date selection, but uses hit system
            this.onSelect = function (selectInfo) {
                if (selectInfo.jsEvent) {
                    _this.isRecentPointerDateSelect = true;
                }
            };
            this.onDocumentPointerUp = function (pev) {
                var _a = _this, calendar = _a.calendar, documentPointer = _a.documentPointer;
                var state = calendar.state;
                // touch-scrolling should never unfocus any type of selection
                if (!documentPointer.wasTouchScroll) {
                    if (state.dateSelection && // an existing date selection?
                        !_this.isRecentPointerDateSelect // a new pointer-initiated date selection since last onDocumentPointerUp?
                    ) {
                        var unselectAuto = calendar.viewOpt('unselectAuto');
                        var unselectCancel = calendar.viewOpt('unselectCancel');
                        if (unselectAuto && (!unselectAuto || !elementClosest(documentPointer.downEl, unselectCancel))) {
                            calendar.unselect(pev);
                        }
                    }
                    if (state.eventSelection && // an existing event selected?
                        !elementClosest(documentPointer.downEl, EventDragging.SELECTOR) // interaction DIDN'T start on an event
                    ) {
                        calendar.dispatch({ type: 'UNSELECT_EVENT' });
                    }
                }
                _this.isRecentPointerDateSelect = false;
            };
            this.calendar = calendar;
            var documentPointer = this.documentPointer = new PointerDragging(document);
            documentPointer.shouldIgnoreMove = true;
            documentPointer.shouldWatchScroll = false;
            documentPointer.emitter.on('pointerup', this.onDocumentPointerUp);
            /*
            TODO: better way to know about whether there was a selection with the pointer
            */
            calendar.on('select', this.onSelect);
        }
        UnselectAuto.prototype.destroy = function () {
            this.calendar.off('select', this.onSelect);
            this.documentPointer.destroy();
        };
        return UnselectAuto;
    }());
    config.dataAttrPrefix = '';

    /*
    Detects when a *THIRD-PARTY* drag-n-drop system interacts with elements.
    The third-party system is responsible for drawing the visuals effects of the drag.
    This class simply monitors for pointer movements and fires events.
    It also has the ability to hide the moving element (the "mirror") during the drag.
    */
    var InferredElementDragging = /** @class */ (function (_super) {
        __extends(InferredElementDragging, _super);
        function InferredElementDragging(containerEl) {
            var _this = _super.call(this, containerEl) || this;
            _this.shouldIgnoreMove = false;
            _this.mirrorSelector = '';
            _this.currentMirrorEl = null;
            _this.handlePointerDown = function (ev) {
                _this.emitter.trigger('pointerdown', ev);
                if (!_this.shouldIgnoreMove) {
                    // fire dragstart right away. does not support delay or min-distance
                    _this.emitter.trigger('dragstart', ev);
                }
            };
            _this.handlePointerMove = function (ev) {
                if (!_this.shouldIgnoreMove) {
                    _this.emitter.trigger('dragmove', ev);
                }
            };
            _this.handlePointerUp = function (ev) {
                _this.emitter.trigger('pointerup', ev);
                if (!_this.shouldIgnoreMove) {
                    // fire dragend right away. does not support a revert animation
                    _this.emitter.trigger('dragend', ev);
                }
            };
            var pointer = _this.pointer = new PointerDragging(containerEl);
            pointer.emitter.on('pointerdown', _this.handlePointerDown);
            pointer.emitter.on('pointermove', _this.handlePointerMove);
            pointer.emitter.on('pointerup', _this.handlePointerUp);
            return _this;
        }
        InferredElementDragging.prototype.destroy = function () {
            this.pointer.destroy();
        };
        InferredElementDragging.prototype.setIgnoreMove = function (bool) {
            this.shouldIgnoreMove = bool;
        };
        InferredElementDragging.prototype.setMirrorIsVisible = function (bool) {
            if (bool) {
                // restore a previously hidden element.
                // use the reference in case the selector class has already been removed.
                if (this.currentMirrorEl) {
                    this.currentMirrorEl.style.visibility = '';
                    this.currentMirrorEl = null;
                }
            }
            else {
                var mirrorEl = this.mirrorSelector ?
                    document.querySelector(this.mirrorSelector) :
                    null;
                if (mirrorEl) {
                    this.currentMirrorEl = mirrorEl;
                    mirrorEl.style.visibility = 'hidden';
                }
            }
        };
        return InferredElementDragging;
    }(ElementDragging));

    var main$2 = createPlugin({
        componentInteractions: [DateClicking, DateSelecting, EventDragging, EventDragging$1],
        calendarInteractions: [UnselectAuto],
        elementDraggingImpl: FeaturefulElementDragging
    });

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }
    function quadIn(t) {
        return t * t;
    }
    function quadOut(t) {
        return -t * (t - 2.0);
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
    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    /* src/svelte/components/Dialog.svelte generated by Svelte v3.20.1 */
    const file = "src/svelte/components/Dialog.svelte";
    const get_actions_slot_changes = dirty => ({});
    const get_actions_slot_context = ctx => ({});
    const get_title_slot_changes = dirty => ({});
    const get_title_slot_context = ctx => ({});

    // (18:0) {#if visible}
    function create_if_block(ctx) {
    	let div5;
    	let div0;
    	let div0_intro;
    	let div0_outro;
    	let t0;
    	let div4;
    	let div3;
    	let div1;
    	let t1;
    	let t2;
    	let div2;
    	let div3_intro;
    	let div3_outro;
    	let current;
    	let dispose;
    	const title_slot_template = /*$$slots*/ ctx[8].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[7], get_title_slot_context);
    	const default_slot_template = /*$$slots*/ ctx[8].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[7], null);
    	const actions_slot_template = /*$$slots*/ ctx[8].actions;
    	const actions_slot = create_slot(actions_slot_template, ctx, /*$$scope*/ ctx[7], get_actions_slot_context);

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div4 = element("div");
    			div3 = element("div");
    			div1 = element("div");
    			if (title_slot) title_slot.c();
    			t1 = space();
    			if (default_slot) default_slot.c();
    			t2 = space();
    			div2 = element("div");
    			if (actions_slot) actions_slot.c();
    			attr_dev(div0, "class", "bg-lbfbleu-900 fixed top-0 left-0 z-10 w-full h-full");
    			set_style(div0, "opacity", /*opacity*/ ctx[2]);
    			add_location(div0, file, 19, 4, 588);
    			attr_dev(div1, "class", "h3");
    			add_location(div1, file, 30, 8, 1079);
    			attr_dev(div2, "class", "flex flex-row w-full justify-end items-center pt-2 mt-3 border-t-2 border-gray-400");
    			add_location(div2, file, 34, 8, 1170);
    			attr_dev(div3, "class", "items-start z-50 rounded bg-gray-100 p-4 elevation-4 max-w-5/6");
    			add_location(div3, file, 26, 8, 915);
    			attr_dev(div4, "class", "h-full w-full absolute flex items-start justify-center pt-12");
    			add_location(div4, file, 25, 4, 832);
    			attr_dev(div5, "class", "fixed w-full h-full top-0 left-0 z-200 overflow-y-auto");
    			add_location(div5, file, 18, 2, 515);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div0);
    			append_dev(div5, t0);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div1);

    			if (title_slot) {
    				title_slot.m(div1, null);
    			}

    			append_dev(div3, t1);

    			if (default_slot) {
    				default_slot.m(div3, null);
    			}

    			append_dev(div3, t2);
    			append_dev(div3, div2);

    			if (actions_slot) {
    				actions_slot.m(div2, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen_dev(div0, "click", /*click_handler*/ ctx[9], false, false, false);
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*opacity*/ 4) {
    				set_style(div0, "opacity", /*opacity*/ ctx[2]);
    			}

    			if (title_slot) {
    				if (title_slot.p && dirty & /*$$scope*/ 128) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[7], get_title_slot_context), get_slot_changes(title_slot_template, /*$$scope*/ ctx[7], dirty, get_title_slot_changes));
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 128) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[7], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[7], dirty, null));
    				}
    			}

    			if (actions_slot) {
    				if (actions_slot.p && dirty & /*$$scope*/ 128) {
    					actions_slot.p(get_slot_context(actions_slot_template, ctx, /*$$scope*/ ctx[7], get_actions_slot_context), get_slot_changes(actions_slot_template, /*$$scope*/ ctx[7], dirty, get_actions_slot_changes));
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div0_outro) div0_outro.end(1);
    				if (!div0_intro) div0_intro = create_in_transition(div0, fade, /*inProps*/ ctx[4]);
    				div0_intro.start();
    			});

    			transition_in(title_slot, local);
    			transition_in(default_slot, local);
    			transition_in(actions_slot, local);

    			add_render_callback(() => {
    				if (div3_outro) div3_outro.end(1);
    				if (!div3_intro) div3_intro = create_in_transition(div3, scale, /*transitionProps*/ ctx[6]);
    				div3_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (div0_intro) div0_intro.invalidate();
    			div0_outro = create_out_transition(div0, fade, /*outProps*/ ctx[5]);
    			transition_out(title_slot, local);
    			transition_out(default_slot, local);
    			transition_out(actions_slot, local);
    			if (div3_intro) div3_intro.invalidate();
    			div3_outro = create_out_transition(div3, scale, /*transitionProps*/ ctx[6]);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			if (detaching && div0_outro) div0_outro.end();
    			if (title_slot) title_slot.d(detaching);
    			if (default_slot) default_slot.d(detaching);
    			if (actions_slot) actions_slot.d(detaching);
    			if (detaching && div3_outro) div3_outro.end();
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(18:0) {#if visible}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*visible*/ ctx[0] && create_if_block(ctx);

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
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*visible*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
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
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
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
    	let { visible = false } = $$props;
    	let { persistant = false } = $$props;
    	let { opacity = 0.7 } = $$props;
    	let inProps = { duration: 150, easing: quadIn };
    	let outProps = { duration: 150, easing: quadOut };
    	let transitionProps = { duration: 100, easing: quadIn, delay: 0 };
    	const writable_props = ["visible", "persistant", "opacity"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Dialog> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Dialog", $$slots, ['title','default','actions']);

    	const click_handler = () => {
    		if (visible && !persistant) {
    			dispatch("close");
    		}
    	};

    	$$self.$set = $$props => {
    		if ("visible" in $$props) $$invalidate(0, visible = $$props.visible);
    		if ("persistant" in $$props) $$invalidate(1, persistant = $$props.persistant);
    		if ("opacity" in $$props) $$invalidate(2, opacity = $$props.opacity);
    		if ("$$scope" in $$props) $$invalidate(7, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		fade,
    		quadOut,
    		quadIn,
    		scale,
    		visible,
    		persistant,
    		opacity,
    		inProps,
    		outProps,
    		transitionProps
    	});

    	$$self.$inject_state = $$props => {
    		if ("visible" in $$props) $$invalidate(0, visible = $$props.visible);
    		if ("persistant" in $$props) $$invalidate(1, persistant = $$props.persistant);
    		if ("opacity" in $$props) $$invalidate(2, opacity = $$props.opacity);
    		if ("inProps" in $$props) $$invalidate(4, inProps = $$props.inProps);
    		if ("outProps" in $$props) $$invalidate(5, outProps = $$props.outProps);
    		if ("transitionProps" in $$props) $$invalidate(6, transitionProps = $$props.transitionProps);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		visible,
    		persistant,
    		opacity,
    		dispatch,
    		inProps,
    		outProps,
    		transitionProps,
    		$$scope,
    		$$slots,
    		click_handler
    	];
    }

    class Dialog extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { visible: 0, persistant: 1, opacity: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dialog",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get visible() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set visible(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get persistant() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set persistant(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get opacity() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set opacity(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-fa/src/fa.svelte generated by Svelte v3.20.1 */

    const file$1 = "node_modules/svelte-fa/src/fa.svelte";

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
    			add_location(g0, file$1, 116, 6, 2052);
    			attr_dev(g1, "transform", "translate(256 256)");
    			add_location(g1, file$1, 113, 4, 2000);
    			attr_dev(svg, "id", /*id*/ ctx[1]);
    			attr_dev(svg, "class", /*clazz*/ ctx[0]);
    			attr_dev(svg, "style", /*s*/ ctx[9]);
    			attr_dev(svg, "viewBox", svg_viewBox_value = `0 0 ${/*i*/ ctx[8][0]} ${/*i*/ ctx[8][1]}`);
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "role", "img");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			add_location(svg, file$1, 104, 2, 1830);
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
    			add_location(path0, file$1, 124, 10, 2286);
    			attr_dev(path1, "d", path1_d_value = /*i*/ ctx[8][4][1]);
    			attr_dev(path1, "fill", path1_fill_value = /*primaryColor*/ ctx[3] || /*color*/ ctx[2] || "currentColor");

    			attr_dev(path1, "fill-opacity", path1_fill_opacity_value = /*swapOpacity*/ ctx[7] != false
    			? /*secondaryOpacity*/ ctx[6]
    			: /*primaryOpacity*/ ctx[5]);

    			attr_dev(path1, "transform", "translate(-256 -256)");
    			add_location(path1, file$1, 130, 10, 2529);
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
    			add_location(path, file$1, 118, 10, 2116);
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

    function create_fragment$1(ctx) {
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
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
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

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
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
    			id: create_fragment$1.name
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

    var faArrowLeft = {
      prefix: 'fas',
      iconName: 'arrow-left',
      icon: [448, 512, [], "f060", "M257.5 445.1l-22.2 22.2c-9.4 9.4-24.6 9.4-33.9 0L7 273c-9.4-9.4-9.4-24.6 0-33.9L201.4 44.7c9.4-9.4 24.6-9.4 33.9 0l22.2 22.2c9.5 9.5 9.3 25-.4 34.3L136.6 216H424c13.3 0 24 10.7 24 24v32c0 13.3-10.7 24-24 24H136.6l120.5 114.8c9.8 9.3 10 24.8.4 34.3z"]
    };
    var faCheck = {
      prefix: 'fas',
      iconName: 'check',
      icon: [512, 512, [], "f00c", "M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"]
    };
    var faTrashAlt = {
      prefix: 'fas',
      iconName: 'trash-alt',
      icon: [448, 512, [], "f2ed", "M32 464a48 48 0 0 0 48 48h288a48 48 0 0 0 48-48V128H32zm272-256a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zm-96 0a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zm-96 0a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zM432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16z"]
    };

    /* src/svelte/components/bouton.svelte generated by Svelte v3.20.1 */
    const file$2 = "src/svelte/components/bouton.svelte";
    const get_default_slot_changes = dirty => ({});
    const get_default_slot_context = ctx => ({ class: "mx-auto" });

    // (49:4) {:else}
    function create_else_block$1(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[15].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[14], get_default_slot_context);
    	const default_slot_or_fallback = default_slot || fallback_block(ctx);

    	const block = {
    		c: function create() {
    			if (default_slot_or_fallback) default_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			if (default_slot_or_fallback) {
    				default_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16384) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[14], get_default_slot_context), get_slot_changes(default_slot_template, /*$$scope*/ ctx[14], dirty, get_default_slot_changes));
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
    			if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(49:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (45:21) 
    function create_if_block_1$1(ctx) {
    	let div;
    	let current;

    	const fa = new Fa({
    			props: {
    				icon: faCheck,
    				size: "2x",
    				class: "mx-auto"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(fa.$$.fragment);
    			attr_dev(div, "class", /*couleur*/ ctx[2]);
    			add_location(div, file$2, 45, 8, 2395);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(fa, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*couleur*/ 4) {
    				attr_dev(div, "class", /*couleur*/ ctx[2]);
    			}
    		},
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
    			if (detaching) detach_dev(div);
    			destroy_component(fa);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(45:21) ",
    		ctx
    	});

    	return block;
    }

    // (32:4) {#if occupe}
    function create_if_block$2(ctx) {
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
    			add_location(animate0, file$2, 35, 20, 1510);
    			attr_dev(animate1, "attributeName", "stroke-opacity");
    			attr_dev(animate1, "begin", "0s");
    			attr_dev(animate1, "dur", "1.8s");
    			attr_dev(animate1, "values", "1; 0");
    			attr_dev(animate1, "calcMode", "spline");
    			attr_dev(animate1, "keyTimes", "0; 1");
    			attr_dev(animate1, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate1, "repeatCount", "indefinite");
    			add_location(animate1, file$2, 36, 20, 1689);
    			attr_dev(circle0, "cx", "22");
    			attr_dev(circle0, "cy", "22");
    			attr_dev(circle0, "r", "1");
    			add_location(circle0, file$2, 34, 16, 1459);
    			attr_dev(animate2, "attributeName", "r");
    			attr_dev(animate2, "begin", "-0.9s");
    			attr_dev(animate2, "dur", "1.8s");
    			attr_dev(animate2, "values", "1; 20");
    			attr_dev(animate2, "calcMode", "spline");
    			attr_dev(animate2, "keyTimes", "0; 1");
    			attr_dev(animate2, "keySplines", "0.165, 0.84, 0.44, 1");
    			attr_dev(animate2, "repeatCount", "indefinite");
    			add_location(animate2, file$2, 39, 20, 1952);
    			attr_dev(animate3, "attributeName", "stroke-opacity");
    			attr_dev(animate3, "begin", "-0.9s");
    			attr_dev(animate3, "dur", "1.8s");
    			attr_dev(animate3, "values", "1; 0");
    			attr_dev(animate3, "calcMode", "spline");
    			attr_dev(animate3, "keyTimes", "0; 1");
    			attr_dev(animate3, "keySplines", "0.3, 0.61, 0.355, 1");
    			attr_dev(animate3, "repeatCount", "indefinite");
    			add_location(animate3, file$2, 40, 20, 2134);
    			attr_dev(circle1, "cx", "22");
    			attr_dev(circle1, "cy", "22");
    			attr_dev(circle1, "r", "1");
    			add_location(circle1, file$2, 38, 16, 1901);
    			attr_dev(g, "fill", "none");
    			attr_dev(g, "fill-rule", "evenodd");
    			attr_dev(g, "stroke-width", "2");
    			add_location(g, file$2, 33, 12, 1390);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "class", /*classSVG*/ ctx[6]);
    			attr_dev(svg, "viewBox", "0 0 50 50");
    			add_location(svg, file$2, 32, 8, 1300);
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
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(32:4) {#if occupe}",
    		ctx
    	});

    	return block;
    }

    // (50:30) un bouton
    function fallback_block(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("un bouton");
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
    		id: fallback_block.name,
    		type: "fallback",
    		source: "(50:30) un bouton",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let button;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	let dispose;
    	const if_block_creators = [create_if_block$2, create_if_block_1$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*occupe*/ ctx[0]) return 0;
    		if (/*succes*/ ctx[1]) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			button = element("button");
    			if_block.c();
    			attr_dev(button, "class", /*classBouton*/ ctx[4]);
    			attr_dev(button, "id", "leBouton");
    			add_location(button, file$2, 30, 0, 1170);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, button, anchor);
    			if_blocks[current_block_type_index].m(button, null);
    			current = true;
    			if (remount) dispose();
    			dispose = listen_dev(button, "click", /*click_handler*/ ctx[16], false, false, false);
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
    				if_block.m(button, null);
    			}

    			if (!current || dirty & /*classBouton*/ 16) {
    				attr_dev(button, "class", /*classBouton*/ ctx[4]);
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
    			if (detaching) detach_dev(button);
    			if_blocks[current_block_type_index].d();
    			dispose();
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
    	const component = get_current_component();
    	const svelteDispatch = createEventDispatcher();

    	const dispatch = (name, detail) => {
    		svelteDispatch(name, detail);
    		component.dispatchEvent && component.dispatchEvent(new CustomEvent(name, { detail }));
    	};

    	const actionBouton = () => {
    		document.getElementById("leBouton").blur();
    		dispatch("actionBouton");
    	};

    	let { occupe = false } = $$props;
    	let { succes = false } = $$props;
    	let { couleur = "text-bleuLBF border-bleuLBF" } = $$props;
    	let { couleurSVG = "text-bleuLBF-500 bg-bleuLBF-500" } = $$props;
    	let { largeur = "w-32" } = $$props;
    	let { noBorder = false } = $$props;
    	let { disabled = false } = $$props;
    	const classSVG = "fill-current stroke-current h-8 w-8 mx-auto mt-2" + couleurSVG;
    	const writable_props = ["occupe", "succes", "couleur", "couleurSVG", "largeur", "noBorder", "disabled"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Bouton> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Bouton", $$slots, ['default']);

    	const click_handler = () => {
    		if (!occupe && !disabled) {
    			actionBouton();
    		}
    	};

    	$$self.$set = $$props => {
    		if ("occupe" in $$props) $$invalidate(0, occupe = $$props.occupe);
    		if ("succes" in $$props) $$invalidate(1, succes = $$props.succes);
    		if ("couleur" in $$props) $$invalidate(2, couleur = $$props.couleur);
    		if ("couleurSVG" in $$props) $$invalidate(7, couleurSVG = $$props.couleurSVG);
    		if ("largeur" in $$props) $$invalidate(8, largeur = $$props.largeur);
    		if ("noBorder" in $$props) $$invalidate(9, noBorder = $$props.noBorder);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    		if ("$$scope" in $$props) $$invalidate(14, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		get_current_component,
    		Fa,
    		faCheck,
    		component,
    		svelteDispatch,
    		dispatch,
    		actionBouton,
    		occupe,
    		succes,
    		couleur,
    		couleurSVG,
    		largeur,
    		noBorder,
    		disabled,
    		classSVG,
    		border,
    		classBouton
    	});

    	$$self.$inject_state = $$props => {
    		if ("occupe" in $$props) $$invalidate(0, occupe = $$props.occupe);
    		if ("succes" in $$props) $$invalidate(1, succes = $$props.succes);
    		if ("couleur" in $$props) $$invalidate(2, couleur = $$props.couleur);
    		if ("couleurSVG" in $$props) $$invalidate(7, couleurSVG = $$props.couleurSVG);
    		if ("largeur" in $$props) $$invalidate(8, largeur = $$props.largeur);
    		if ("noBorder" in $$props) $$invalidate(9, noBorder = $$props.noBorder);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    		if ("border" in $$props) $$invalidate(10, border = $$props.border);
    		if ("classBouton" in $$props) $$invalidate(4, classBouton = $$props.classBouton);
    	};

    	let border;
    	let classBouton;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*occupe, disabled, succes, noBorder*/ 523) {
    			 $$invalidate(10, border = occupe || disabled || succes
    			? "cursor-default"
    			: noBorder ? "cursor-pointer" : "border-2 cursor-pointer");
    		}

    		if ($$self.$$.dirty & /*couleur, border, largeur*/ 1284) {
    			 $$invalidate(4, classBouton = "h-10 mx-1 px-1 my-auto rounded text-base font-medium focus:outline-none " + couleur + " " + border + " " + largeur);
    		}
    	};

    	return [
    		occupe,
    		succes,
    		couleur,
    		disabled,
    		classBouton,
    		actionBouton,
    		classSVG,
    		couleurSVG,
    		largeur,
    		noBorder,
    		border,
    		component,
    		svelteDispatch,
    		dispatch,
    		$$scope,
    		$$slots,
    		click_handler
    	];
    }

    class Bouton extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			occupe: 0,
    			succes: 1,
    			couleur: 2,
    			couleurSVG: 7,
    			largeur: 8,
    			noBorder: 9,
    			disabled: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Bouton",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get occupe() {
    		throw new Error("<Bouton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set occupe(value) {
    		throw new Error("<Bouton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get succes() {
    		throw new Error("<Bouton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set succes(value) {
    		throw new Error("<Bouton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get couleur() {
    		throw new Error("<Bouton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set couleur(value) {
    		throw new Error("<Bouton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get couleurSVG() {
    		throw new Error("<Bouton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set couleurSVG(value) {
    		throw new Error("<Bouton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get largeur() {
    		throw new Error("<Bouton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set largeur(value) {
    		throw new Error("<Bouton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get noBorder() {
    		throw new Error("<Bouton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noBorder(value) {
    		throw new Error("<Bouton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Bouton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Bouton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var faSave = {
      prefix: 'far',
      iconName: 'save',
      icon: [448, 512, [], "f0c7", "M433.941 129.941l-83.882-83.882A48 48 0 0 0 316.118 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V163.882a48 48 0 0 0-14.059-33.941zM272 80v80H144V80h128zm122 352H54a6 6 0 0 1-6-6V86a6 6 0 0 1 6-6h42v104c0 13.255 10.745 24 24 24h176c13.255 0 24-10.745 24-24V83.882l78.243 78.243a6 6 0 0 1 1.757 4.243V426a6 6 0 0 1-6 6zM224 232c-48.523 0-88 39.477-88 88s39.477 88 88 88 88-39.477 88-88-39.477-88-88-88zm0 128c-22.056 0-40-17.944-40-40s17.944-40 40-40 40 17.944 40 40-17.944 40-40 40z"]
    };

    async function requeteGraphQL(query, variables) {
        var body = {query: query};
        if (variables!== undefined) {
            body.variables = variables;
        }
        const entetes = {};
        var options = {
            method: "POST",
            headers: entetes,
            cache: "no-cache",
            body: JSON.stringify(body)
        };
        return fetch("https://graphql.labonnefabrique.fr/v1/graphql", options)
            .then((retourFetch)=>{
                return retourFetch.json()
            })
            .then((retourJSON)=>{
                console.log('retourJSON', retourJSON);
                return retourJSON.data
            }).catch((error)=>{console.log('erreur', erreur);})
        }

    async function listePlagesHoraires(variables) {
        const query = `
            query horairesReservationMachines {
                horairesReservationMachines {
                id
                plages
                }
            }
            `;
        return requeteGraphQL(query, variables)
            .then((resultats)=> {return resultats.horairesReservationMachines})
    }

    async function sauveReservation(variables) {
        const query = `
            mutation ajoutReservation(
                $dateDebut: timestamptz
                $dateFin: timestamptz
                $email: String
                $idMachine: uuid
                $nom: String
                $prenom: String
            ) {
                insert_reservationMachines(
                objects: {
                    dateDebut: $dateDebut
                    dateFin: $dateFin
                    email: $email
                    idMachine: $idMachine
                    nom: $nom
                    prenom: $prenom
                }
                ) {
                returning {
                    id
                }
                }
            }
            `;
        return requeteGraphQL(query, variables)
            .then((resultats)=> {
                return resultats.insert_reservationMachines.returning[0]
            })
    }

    async function listeReservations(variables) {
        const query = `
            query listeResaMachine($idMachine: uuid) {
                reservationMachines(where: {idMachine: {_eq: $idMachine}}) {
                    dateDebut
                    dateFin
                    id
                    machine {
                        couleur
                        urlImage
                    }
                }
            }
        `;
        return requeteGraphQL(query, variables)
            .then((resultats)=> {
                return resultats.reservationMachines
            })
    }

    async function reservationById(variables) {
        const query = `
            query listeResaMachine($id: uuid) {
                reservationMachines(where: {id: {_eq: $id}}) {
                    nom
                    prenom
                    email
                    dateDebut
                    dateFin
                    machine {
                        couleur
                        urlImage
                    }
                }
            }
        `;
        return requeteGraphQL(query, variables)
            .then((resultats)=> {
                return resultats.reservationMachines
            })
    }


    async function effacerReservation(variables) {
        const query = `mutation effaceReservation($id: uuid) {
            __typename
                delete_reservationMachines(where: {id: {_eq: $id}}) {
                    returning {
                    id
                    }
                }
            }`;
        return requeteGraphQL(query, variables)
            .then((resultats)=> {
                return resultats.delete_reservationMachines
            })
    }

    async function envoyerMail(variables) {
        const query = `
                mutation envoiMail($email: [String!]!, $template: String) {
                    sendEmail(
                    from: "atelierdusappey@gmail.com"
                    to: $email
                    templateId: "d-08bb9e1b96ac4d56a9210660cac6cd07"
                    dynamic_template_data: $template
                    ) {
                    success
                    }
                }
            `;
        return requeteGraphQL(query, variables)
            .then((resultats)=> {
                return resultats.insert_reservationMachines
            })
    }

    const couleur2 = [];
    couleur2['rouge'] = { numCouleur: '#e32e39', espace: 'rencontre', variante: 'rouge', classText: 'text-rougeLBF' };
    couleur2['jaune'] = { numCouleur: '#fcc62d', espace: 'brasserie', variante: 'jaune', classText: 'text-jauneLBF' };
    couleur2['bleu'] = { numCouleur: '#4bbcc4', espace: 'coworking', variante: 'bleu', classText: 'text-bleuLBF' };
    couleur2['orange'] = { numCouleur: '#ee732e', espace: 'atelier', variante: 'orange', classText: 'text-orangeLBF' };
    couleur2['vert'] = { numCouleur: '#93c021', espace: 'jardin', variante: 'vert', classText: 'text-vertLBF' };
    couleur2['violet'] = { numCouleur: '#5e4b99', espace: 'autre', variante: 'violet', classText: 'text-violetLBF' };
    const tableCouleursLBF = couleur2;

    /* src/svelte/reservationsMachines/reservationsMachines.svelte generated by Svelte v3.20.1 */

    const { console: console_1 } = globals;
    const file$3 = "src/svelte/reservationsMachines/reservationsMachines.svelte";

    // (257:4) <div slot="title" class="text-xl sm:text-2xl font-bold text-center">
    function create_title_slot_2(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = `Réservation de ${titreMachine}`;
    			attr_dev(div, "slot", "title");
    			attr_dev(div, "class", "text-xl sm:text-2xl font-bold text-center");
    			add_location(div, file$3, 256, 4, 8359);
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
    		id: create_title_slot_2.name,
    		type: "slot",
    		source: "(257:4) <div slot=\\\"title\\\" class=\\\"text-xl sm:text-2xl font-bold text-center\\\">",
    		ctx
    	});

    	return block;
    }

    // (310:8) <Bouton largeur="w-10" on:actionBouton={fini} >
    function create_default_slot_8(ctx) {
    	let current;

    	const fa = new Fa({
    			props: {
    				icon: faArrowLeft,
    				size: "lg",
    				class: "mx-auto"
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
    		id: create_default_slot_8.name,
    		type: "slot",
    		source: "(310:8) <Bouton largeur=\\\"w-10\\\" on:actionBouton={fini} >",
    		ctx
    	});

    	return block;
    }

    // (317:8) {:else}
    function create_else_block$2(ctx) {
    	let current;

    	const bouton = new Bouton({
    			props: {
    				largeur: "w-12",
    				couleur: "text-rougeLBF border-rougeLBF",
    				$$slots: { default: [create_default_slot_7] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	bouton.$on("actionBouton", /*actionBouton_handler*/ ctx[33]);

    	const block = {
    		c: function create() {
    			create_component(bouton.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(bouton, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const bouton_changes = {};

    			if (dirty[1] & /*$$scope*/ 128) {
    				bouton_changes.$$scope = { dirty, ctx };
    			}

    			bouton.$set(bouton_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(bouton.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(bouton.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(bouton, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(317:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (313:8) {#if !flagEffacerResa}
    function create_if_block$3(ctx) {
    	let current;

    	const bouton = new Bouton({
    			props: {
    				largeur: "w-12",
    				couleur: "text-rougeLBF border-rougeLBF",
    				occupe: /*busySauverReservation*/ ctx[7],
    				$$slots: { default: [create_default_slot_6] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	bouton.$on("actionBouton", /*sauverReservation*/ ctx[15]);

    	const block = {
    		c: function create() {
    			create_component(bouton.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(bouton, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const bouton_changes = {};
    			if (dirty[0] & /*busySauverReservation*/ 128) bouton_changes.occupe = /*busySauverReservation*/ ctx[7];

    			if (dirty[1] & /*$$scope*/ 128) {
    				bouton_changes.$$scope = { dirty, ctx };
    			}

    			bouton.$set(bouton_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(bouton.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(bouton.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(bouton, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(313:8) {#if !flagEffacerResa}",
    		ctx
    	});

    	return block;
    }

    // (318:12) <Bouton largeur="w-12" couleur = "text-rougeLBF border-rougeLBF" on:actionBouton={() => flagConfirmationEffacerResa = true}>
    function create_default_slot_7(ctx) {
    	let current;

    	const fa = new Fa({
    			props: {
    				icon: faTrashAlt,
    				size: "lg",
    				class: "mx-auto"
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
    		id: create_default_slot_7.name,
    		type: "slot",
    		source: "(318:12) <Bouton largeur=\\\"w-12\\\" couleur = \\\"text-rougeLBF border-rougeLBF\\\" on:actionBouton={() => flagConfirmationEffacerResa = true}>",
    		ctx
    	});

    	return block;
    }

    // (314:8) <Bouton largeur="w-12" couleur = "text-rougeLBF border-rougeLBF" occupe={busySauverReservation} on:actionBouton={sauverReservation}>
    function create_default_slot_6(ctx) {
    	let current;

    	const fa = new Fa({
    			props: {
    				icon: faSave,
    				size: "lg",
    				class: "mx-auto"
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
    		id: create_default_slot_6.name,
    		type: "slot",
    		source: "(314:8) <Bouton largeur=\\\"w-12\\\" couleur = \\\"text-rougeLBF border-rougeLBF\\\" occupe={busySauverReservation} on:actionBouton={sauverReservation}>",
    		ctx
    	});

    	return block;
    }

    // (309:4) <div slot="actions">
    function create_actions_slot_2(ctx) {
    	let div;
    	let t;
    	let current_block_type_index;
    	let if_block;
    	let current;

    	const bouton = new Bouton({
    			props: {
    				largeur: "w-10",
    				$$slots: { default: [create_default_slot_8] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	bouton.$on("actionBouton", /*fini*/ ctx[16]);
    	const if_block_creators = [create_if_block$3, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (!/*flagEffacerResa*/ ctx[8]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(bouton.$$.fragment);
    			t = space();
    			if_block.c();
    			attr_dev(div, "slot", "actions");
    			add_location(div, file$3, 308, 4, 10982);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(bouton, div, null);
    			append_dev(div, t);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const bouton_changes = {};

    			if (dirty[1] & /*$$scope*/ 128) {
    				bouton_changes.$$scope = { dirty, ctx };
    			}

    			bouton.$set(bouton_changes);
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
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(bouton.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(bouton.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(bouton);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_actions_slot_2.name,
    		type: "slot",
    		source: "(309:4) <div slot=\\\"actions\\\">",
    		ctx
    	});

    	return block;
    }

    // (256:0) <Dialog bind:visible={flagReservation} on:close={fini}>
    function create_default_slot_5(ctx) {
    	let t0;
    	let h3;
    	let t1_value = /*dataReservation*/ ctx[1].dateDebut.toLocaleDateString("fr-fr", /*options*/ ctx[12]) + "";
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let div9;
    	let div4;
    	let label0;
    	let div0;
    	let t8;
    	let div1;
    	let input0;
    	let t9;
    	let label1;
    	let div2;
    	let t11;
    	let div3;
    	let input1;
    	let t12;
    	let label2;
    	let div5;
    	let t14;
    	let div6;
    	let input2;
    	let t15;
    	let div7;
    	let t17;
    	let div8;
    	let label3;
    	let input3;
    	let t18;
    	let t19;
    	let dispose;

    	const block = {
    		c: function create() {
    			t0 = space();
    			h3 = element("h3");
    			t1 = text(t1_value);
    			t2 = text(" de ");
    			t3 = text(/*horaireDebut*/ ctx[3]);
    			t4 = text(" à ");
    			t5 = text(/*horaireFin*/ ctx[4]);
    			t6 = space();
    			div9 = element("div");
    			div4 = element("div");
    			label0 = element("label");
    			div0 = element("div");
    			div0.textContent = "Prénom :";
    			t8 = space();
    			div1 = element("div");
    			input0 = element("input");
    			t9 = space();
    			label1 = element("label");
    			div2 = element("div");
    			div2.textContent = "Nom :";
    			t11 = space();
    			div3 = element("div");
    			input1 = element("input");
    			t12 = space();
    			label2 = element("label");
    			div5 = element("div");
    			div5.textContent = "Email (requis) :";
    			t14 = space();
    			div6 = element("div");
    			input2 = element("input");
    			t15 = space();
    			div7 = element("div");
    			div7.textContent = "Vous recevrez un email de confirmation qui contiendra un lien pour\n            effacer votre réservation si besoin. Il est donc important d'entrer une adresse valide.";
    			t17 = space();
    			div8 = element("div");
    			label3 = element("label");
    			input3 = element("input");
    			t18 = text("\n                Enregistrer mes coordonnées pour la prochaine fois (ces informations sont stockées sur votre ordinateur)");
    			t19 = space();
    			attr_dev(h3, "class", "text-lg font-bold text-center text-vertLBF border-b border-vertLBF pb-3 mb-1");
    			add_location(h3, file$3, 257, 4, 8467);
    			add_location(div0, file$3, 263, 12, 8875);
    			attr_dev(input0, "class", "w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "id", "prenomResa");
    			add_location(input0, file$3, 265, 16, 8971);
    			attr_dev(div1, "class", "border border-vertLBF rounded p-1");
    			add_location(div1, file$3, 264, 12, 8907);
    			attr_dev(label0, "for", "prenomResa");
    			attr_dev(label0, "class", "w-full md:w-1/2 mx-1 my-1 flex flex-col");
    			add_location(label0, file$3, 262, 12, 8790);
    			add_location(div2, file$3, 274, 12, 9364);
    			attr_dev(input1, "class", "w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "id", "nomResa");
    			add_location(input1, file$3, 276, 16, 9457);
    			attr_dev(div3, "class", "border border-vertLBF rounded p-1");
    			add_location(div3, file$3, 275, 12, 9393);
    			attr_dev(label1, "for", "nomResa");
    			attr_dev(label1, "class", "w-full md:w-1/2 mx-1 my-1 flex flex-col");
    			add_location(label1, file$3, 273, 12, 9282);
    			attr_dev(div4, "class", "w-full flex flex-row flex-wrap md:flex-no-wrap");
    			add_location(div4, file$3, 261, 12, 8717);
    			add_location(div5, file$3, 286, 12, 9865);
    			attr_dev(input2, "class", "w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal");
    			attr_dev(input2, "type", "text");
    			attr_dev(input2, "id", "emailResa");
    			add_location(input2, file$3, 288, 16, 9969);
    			attr_dev(div6, "class", "border border-vertLBF rounded p-1");
    			add_location(div6, file$3, 287, 12, 9905);
    			attr_dev(label2, "for", "emailResa");
    			attr_dev(label2, "class", "mx-1 my-1 flex flex-col");
    			add_location(label2, file$3, 285, 8, 9797);
    			attr_dev(div7, "class", "text-base max-w-320px mx-auto text-justify");
    			add_location(div7, file$3, 296, 8, 10290);
    			attr_dev(input3, "type", "checkbox");
    			attr_dev(input3, "class", "form-checkbox text-lbfvert-600 focus:outline-none");
    			attr_dev(input3, "id", "checkSaveInfo");
    			add_location(input3, file$3, 302, 16, 10675);
    			attr_dev(label3, "for", "checkSaveInfo");
    			attr_dev(label3, "class", "mx-8 pr-8 my-1 text-sm");
    			add_location(label3, file$3, 301, 12, 10600);
    			attr_dev(div8, "class", "mt-2 max-w-320px mx-auto");
    			add_location(div8, file$3, 300, 8, 10549);
    			attr_dev(div9, "class", "mt-2 mb-2");
    			add_location(div9, file$3, 260, 8, 8681);
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, h3, anchor);
    			append_dev(h3, t1);
    			append_dev(h3, t2);
    			append_dev(h3, t3);
    			append_dev(h3, t4);
    			append_dev(h3, t5);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, div9, anchor);
    			append_dev(div9, div4);
    			append_dev(div4, label0);
    			append_dev(label0, div0);
    			append_dev(label0, t8);
    			append_dev(label0, div1);
    			append_dev(div1, input0);
    			set_input_value(input0, /*userInfo*/ ctx[6].prenom);
    			append_dev(div4, t9);
    			append_dev(div4, label1);
    			append_dev(label1, div2);
    			append_dev(label1, t11);
    			append_dev(label1, div3);
    			append_dev(div3, input1);
    			set_input_value(input1, /*userInfo*/ ctx[6].nom);
    			append_dev(div9, t12);
    			append_dev(div9, label2);
    			append_dev(label2, div5);
    			append_dev(label2, t14);
    			append_dev(label2, div6);
    			append_dev(div6, input2);
    			set_input_value(input2, /*userInfo*/ ctx[6].email);
    			append_dev(div9, t15);
    			append_dev(div9, div7);
    			append_dev(div9, t17);
    			append_dev(div9, div8);
    			append_dev(div8, label3);
    			append_dev(label3, input3);
    			input3.checked = /*saveInfo*/ ctx[5];
    			append_dev(label3, t18);
    			insert_dev(target, t19, anchor);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(input0, "input", /*input0_input_handler*/ ctx[29]),
    				listen_dev(input1, "input", /*input1_input_handler*/ ctx[30]),
    				listen_dev(input2, "input", /*input2_input_handler*/ ctx[31]),
    				listen_dev(input3, "change", /*input3_change_handler*/ ctx[32])
    			];
    		},
    		p: function update(ctx, dirty) {
    			if ( t1_value !== (t1_value = /*dataReservation*/ ctx[1].dateDebut.toLocaleDateString("fr-fr", /*options*/ ctx[12]) + "")) set_data_dev(t1, t1_value);
    			set_data_dev(t3, /*horaireDebut*/ ctx[3]);
    			set_data_dev(t5, /*horaireFin*/ ctx[4]);

    			if (dirty[0] & /*userInfo*/ 64 && input0.value !== /*userInfo*/ ctx[6].prenom) {
    				set_input_value(input0, /*userInfo*/ ctx[6].prenom);
    			}

    			if (dirty[0] & /*userInfo*/ 64 && input1.value !== /*userInfo*/ ctx[6].nom) {
    				set_input_value(input1, /*userInfo*/ ctx[6].nom);
    			}

    			if (dirty[0] & /*userInfo*/ 64 && input2.value !== /*userInfo*/ ctx[6].email) {
    				set_input_value(input2, /*userInfo*/ ctx[6].email);
    			}

    			if (dirty[0] & /*saveInfo*/ 32) {
    				input3.checked = /*saveInfo*/ ctx[5];
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(h3);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(div9);
    			if (detaching) detach_dev(t19);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_5.name,
    		type: "slot",
    		source: "(256:0) <Dialog bind:visible={flagReservation} on:close={fini}>",
    		ctx
    	});

    	return block;
    }

    // (326:4) <h4 slot="title">
    function create_title_slot_1(ctx) {
    	let h4;

    	const block = {
    		c: function create() {
    			h4 = element("h4");
    			h4.textContent = "Confirmation";
    			attr_dev(h4, "slot", "title");
    			add_location(h4, file$3, 325, 4, 11747);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h4, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h4);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_title_slot_1.name,
    		type: "slot",
    		source: "(326:4) <h4 slot=\\\"title\\\">",
    		ctx
    	});

    	return block;
    }

    // (329:8) <Bouton on:actionBouton={() => flagConfirmationEffacerResa = false}>
    function create_default_slot_4(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Annuler");
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
    		id: create_default_slot_4.name,
    		type: "slot",
    		source: "(329:8) <Bouton on:actionBouton={() => flagConfirmationEffacerResa = false}>",
    		ctx
    	});

    	return block;
    }

    // (330:8) <Bouton occupe={busyEffacerResa} on:actionBouton = {effaceReservation} couleur="text-orangeLBF border-orangeLBF">
    function create_default_slot_3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Confirmer");
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
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(330:8) <Bouton occupe={busyEffacerResa} on:actionBouton = {effaceReservation} couleur=\\\"text-orangeLBF border-orangeLBF\\\">",
    		ctx
    	});

    	return block;
    }

    // (328:4) <div slot="actions" class="flex flex-row justify-end items-center">
    function create_actions_slot_1(ctx) {
    	let div;
    	let t;
    	let current;

    	const bouton0 = new Bouton({
    			props: {
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	bouton0.$on("actionBouton", /*actionBouton_handler_1*/ ctx[35]);

    	const bouton1 = new Bouton({
    			props: {
    				occupe: /*busyEffacerResa*/ ctx[9],
    				couleur: "text-orangeLBF border-orangeLBF",
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	bouton1.$on("actionBouton", /*effaceReservation*/ ctx[13]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(bouton0.$$.fragment);
    			t = space();
    			create_component(bouton1.$$.fragment);
    			attr_dev(div, "slot", "actions");
    			attr_dev(div, "class", "flex flex-row justify-end items-center");
    			add_location(div, file$3, 327, 4, 11843);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(bouton0, div, null);
    			append_dev(div, t);
    			mount_component(bouton1, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const bouton0_changes = {};

    			if (dirty[1] & /*$$scope*/ 128) {
    				bouton0_changes.$$scope = { dirty, ctx };
    			}

    			bouton0.$set(bouton0_changes);
    			const bouton1_changes = {};
    			if (dirty[0] & /*busyEffacerResa*/ 512) bouton1_changes.occupe = /*busyEffacerResa*/ ctx[9];

    			if (dirty[1] & /*$$scope*/ 128) {
    				bouton1_changes.$$scope = { dirty, ctx };
    			}

    			bouton1.$set(bouton1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(bouton0.$$.fragment, local);
    			transition_in(bouton1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(bouton0.$$.fragment, local);
    			transition_out(bouton1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(bouton0);
    			destroy_component(bouton1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_actions_slot_1.name,
    		type: "slot",
    		source: "(328:4) <div slot=\\\"actions\\\" class=\\\"flex flex-row justify-end items-center\\\">",
    		ctx
    	});

    	return block;
    }

    // (325:0) <Dialog bind:visible={flagConfirmationEffacerResa} >
    function create_default_slot_2(ctx) {
    	let t0;
    	let p;
    	let t2;

    	const block = {
    		c: function create() {
    			t0 = space();
    			p = element("p");
    			p.textContent = "Confirmer la suppression de votre réservation";
    			t2 = space();
    			add_location(p, file$3, 326, 4, 11786);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, p, anchor);
    			insert_dev(target, t2, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(p);
    			if (detaching) detach_dev(t2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(325:0) <Dialog bind:visible={flagConfirmationEffacerResa} >",
    		ctx
    	});

    	return block;
    }

    // (335:4) <h4 slot="title">
    function create_title_slot(ctx) {
    	let h4;

    	const block = {
    		c: function create() {
    			h4 = element("h4");
    			h4.textContent = "Confirmé";
    			attr_dev(h4, "slot", "title");
    			add_location(h4, file$3, 334, 4, 12236);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h4, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h4);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_title_slot.name,
    		type: "slot",
    		source: "(335:4) <h4 slot=\\\"title\\\">",
    		ctx
    	});

    	return block;
    }

    // (338:8) <Bouton on:actionBouton={retourSite}>
    function create_default_slot_1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("OK");
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
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(338:8) <Bouton on:actionBouton={retourSite}>",
    		ctx
    	});

    	return block;
    }

    // (337:4) <div slot="actions" class="flex flex-row justify-end items-center">
    function create_actions_slot(ctx) {
    	let div;
    	let current;

    	const bouton = new Bouton({
    			props: {
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	bouton.$on("actionBouton", /*retourSite*/ ctx[14]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(bouton.$$.fragment);
    			attr_dev(div, "slot", "actions");
    			attr_dev(div, "class", "flex flex-row justify-end items-center");
    			add_location(div, file$3, 336, 4, 12321);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(bouton, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const bouton_changes = {};

    			if (dirty[1] & /*$$scope*/ 128) {
    				bouton_changes.$$scope = { dirty, ctx };
    			}

    			bouton.$set(bouton_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(bouton.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(bouton.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(bouton);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_actions_slot.name,
    		type: "slot",
    		source: "(337:4) <div slot=\\\"actions\\\" class=\\\"flex flex-row justify-end items-center\\\">",
    		ctx
    	});

    	return block;
    }

    // (334:0) <Dialog bind:visible={flagEffaceOK} >
    function create_default_slot(ctx) {
    	let t0;
    	let p;
    	let t2;

    	const block = {
    		c: function create() {
    			t0 = space();
    			p = element("p");
    			p.textContent = "Votre réservation a bien été supprimé.";
    			t2 = space();
    			add_location(p, file$3, 335, 4, 12271);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, p, anchor);
    			insert_dev(target, t2, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(p);
    			if (detaching) detach_dev(t2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(334:0) <Dialog bind:visible={flagEffaceOK} >",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let main;
    	let div;
    	let t0;
    	let updating_visible;
    	let t1;
    	let updating_visible_1;
    	let t2;
    	let updating_visible_2;
    	let current;

    	function dialog0_visible_binding(value) {
    		/*dialog0_visible_binding*/ ctx[34].call(null, value);
    	}

    	let dialog0_props = {
    		$$slots: {
    			default: [create_default_slot_5],
    			actions: [create_actions_slot_2],
    			title: [create_title_slot_2]
    		},
    		$$scope: { ctx }
    	};

    	if (/*flagReservation*/ ctx[2] !== void 0) {
    		dialog0_props.visible = /*flagReservation*/ ctx[2];
    	}

    	const dialog0 = new Dialog({ props: dialog0_props, $$inline: true });
    	binding_callbacks.push(() => bind(dialog0, "visible", dialog0_visible_binding));
    	dialog0.$on("close", /*fini*/ ctx[16]);

    	function dialog1_visible_binding(value) {
    		/*dialog1_visible_binding*/ ctx[36].call(null, value);
    	}

    	let dialog1_props = {
    		$$slots: {
    			default: [create_default_slot_2],
    			actions: [create_actions_slot_1],
    			title: [create_title_slot_1]
    		},
    		$$scope: { ctx }
    	};

    	if (/*flagConfirmationEffacerResa*/ ctx[10] !== void 0) {
    		dialog1_props.visible = /*flagConfirmationEffacerResa*/ ctx[10];
    	}

    	const dialog1 = new Dialog({ props: dialog1_props, $$inline: true });
    	binding_callbacks.push(() => bind(dialog1, "visible", dialog1_visible_binding));

    	function dialog2_visible_binding(value) {
    		/*dialog2_visible_binding*/ ctx[37].call(null, value);
    	}

    	let dialog2_props = {
    		$$slots: {
    			default: [create_default_slot],
    			actions: [create_actions_slot],
    			title: [create_title_slot]
    		},
    		$$scope: { ctx }
    	};

    	if (/*flagEffaceOK*/ ctx[11] !== void 0) {
    		dialog2_props.visible = /*flagEffaceOK*/ ctx[11];
    	}

    	const dialog2 = new Dialog({ props: dialog2_props, $$inline: true });
    	binding_callbacks.push(() => bind(dialog2, "visible", dialog2_visible_binding));

    	const block = {
    		c: function create() {
    			main = element("main");
    			div = element("div");
    			t0 = space();
    			create_component(dialog0.$$.fragment);
    			t1 = space();
    			create_component(dialog1.$$.fragment);
    			t2 = space();
    			create_component(dialog2.$$.fragment);
    			add_location(div, file$3, 252, 4, 8224);
    			add_location(main, file$3, 251, 0, 8212);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, div);
    			/*div_binding*/ ctx[28](div);
    			insert_dev(target, t0, anchor);
    			mount_component(dialog0, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(dialog1, target, anchor);
    			insert_dev(target, t2, anchor);
    			mount_component(dialog2, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const dialog0_changes = {};

    			if (dirty[0] & /*busySauverReservation, flagEffacerResa, flagConfirmationEffacerResa, saveInfo, userInfo, horaireFin, horaireDebut, dataReservation*/ 1530 | dirty[1] & /*$$scope*/ 128) {
    				dialog0_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_visible && dirty[0] & /*flagReservation*/ 4) {
    				updating_visible = true;
    				dialog0_changes.visible = /*flagReservation*/ ctx[2];
    				add_flush_callback(() => updating_visible = false);
    			}

    			dialog0.$set(dialog0_changes);
    			const dialog1_changes = {};

    			if (dirty[0] & /*busyEffacerResa, flagConfirmationEffacerResa*/ 1536 | dirty[1] & /*$$scope*/ 128) {
    				dialog1_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_visible_1 && dirty[0] & /*flagConfirmationEffacerResa*/ 1024) {
    				updating_visible_1 = true;
    				dialog1_changes.visible = /*flagConfirmationEffacerResa*/ ctx[10];
    				add_flush_callback(() => updating_visible_1 = false);
    			}

    			dialog1.$set(dialog1_changes);
    			const dialog2_changes = {};

    			if (dirty[1] & /*$$scope*/ 128) {
    				dialog2_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_visible_2 && dirty[0] & /*flagEffaceOK*/ 2048) {
    				updating_visible_2 = true;
    				dialog2_changes.visible = /*flagEffaceOK*/ ctx[11];
    				add_flush_callback(() => updating_visible_2 = false);
    			}

    			dialog2.$set(dialog2_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(dialog0.$$.fragment, local);
    			transition_in(dialog1.$$.fragment, local);
    			transition_in(dialog2.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(dialog0.$$.fragment, local);
    			transition_out(dialog1.$$.fragment, local);
    			transition_out(dialog2.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			/*div_binding*/ ctx[28](null);
    			if (detaching) detach_dev(t0);
    			destroy_component(dialog0, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(dialog1, detaching);
    			if (detaching) detach_dev(t2);
    			destroy_component(dialog2, detaching);
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
    	let calendarEl;
    	let calendar;
    	let flagBH = true;
    	const urlEffacerResa = window.location;
    	let businessHours = [];
    	let nbPlagesJour = 4;

    	let dataReservation = {
    		dateDebut: new Date(),
    		dateFin: new Date(),
    		idMachine: ""
    	};

    	let flagReservation = false;
    	let laVue = window.innerWidth < 480 ? "vueMobile" : "timeGridWeek";
    	let jourDebutCalendrier = new Date().getDay();
    	let horaireDebut = "";
    	let horaireFin = "";
    	let minutesDebut = "";
    	let minutesFin = "";

    	const options = {
    		weekday: "long",
    		year: "numeric",
    		month: "long",
    		day: "numeric"
    	};

    	let saveInfo = false;

    	if (localStorage["userInfo"]) {
    		var userInfo = JSON.parse(localStorage.getItem("userInfo"));
    		saveInfo = true;
    	} else {
    		var userInfo = { nom: "", prenom: "", email: "" };
    	}

    	let busySauverReservation = false;
    	let flagEffacerResa = false;
    	let busyEffacerResa = false;
    	let flagConfirmationEffacerResa = false;
    	let flagEffaceOK = false;
    	let extracted;

    	listePlagesHoraires().then(retour => {
    		const retourPlage = retour[0].plages;
    		$$invalidate(18, businessHours = []);

    		for (let i = 0; i < 7; i++) {
    			for (let j = 0; j < nbPlagesJour; j++) {
    				if (retourPlage[i][j][0] !== null) {
    					businessHours.push({
    						daysOfWeek: [i],
    						startTime: retourPlage[i][j][0],
    						endTime: retourPlage[i][j][1]
    					});
    				}
    			}
    		}

    		$$invalidate(18, businessHours);
    	});

    	function effaceReservation() {
    		if (saveInfo) {
    			localStorage.setItem("userInfo", JSON.stringify(userInfo));
    		}

    		if (!saveInfo && localStorage["userInfo"]) {
    			localStorage.removeItem("userInfo");
    		}

    		$$invalidate(9, busyEffacerResa = true);

    		effacerReservation({ id: extracted[1] }).then(retour => {
    			$$invalidate(9, busyEffacerResa = false);
    			$$invalidate(2, flagReservation = false);
    			$$invalidate(10, flagConfirmationEffacerResa = false);
    			$$invalidate(11, flagEffaceOK = true);
    		});
    	}

    	function retourSite() {
    		let redirect = urlEffacerResa.origin + urlEffacerResa.pathname;
    		window.location.replace(redirect);
    	}

    	function sauverReservation() {
    		if (saveInfo) {
    			localStorage.setItem("userInfo", JSON.stringify(userInfo));
    		}

    		if (!saveInfo && localStorage["userInfo"]) {
    			localStorage.removeItem("userInfo");
    		}

    		$$invalidate(7, busySauverReservation = true);
    		let variables = { ...userInfo, ...dataReservation };
    		variables.idMachine = idMachine;

    		sauveReservation(variables).then(retour => {
    			mailConfirmation(retour.id);
    			$$invalidate(7, busySauverReservation = false);
    			$$invalidate(2, flagReservation = false);
    		});
    	}

    	function mailConfirmation(idResa) {
    		let tempDuree = (dataReservation.dateFin - dataReservation.dateFin) / 1000 / 60;
    		let dureeString = Math.floor(tempDuree / 60) + "h";
    		dureeString += tempDuree % 60 === 0 ? "00" : tempDuree % 60;
    		let arrayMails = [];
    		arrayMails.push(dataReservation.email);

    		let envoiMail = {
    			machine: titreMachine,
    			prenom: dataReservation.prenom,
    			duration: dureeString,
    			jour: dataReservation.dateDebut.toLocaleDateString("fr-fr", options).replace(":", "h"),
    			urlDelete: urlEffacerResa.origin + urlEffacerResa.pathname + "?idReservation=" + idResa,
    			altMachine: titreMachine,
    			urlImageMail: "https://res.cloudinary.com/la-bonne-fabrique/image/upload/ar_1.5,w_200,c_fill/" + urlImageMachine
    		};

    		let variables = {
    			email: arrayMails,
    			template: JSON.stringify(envoiMail)
    		};

    		envoyerMail(variables);
    	}

    	onMount(() => {
    		$$invalidate(17, calendar = new Calendar(calendarEl,
    		{
    				selectable: true,
    				editable: false,
    				eventStartEditable: false,
    				eventResizableFromStart: true,
    				plugins: [main$1, main, main$2],
    				initialView: laVue,
    				views: {
    					vueMobile: { type: "timeGrid", duration: { days: 5 } }
    				},
    				locale: "fr",
    				firstDay: jourDebutCalendrier,
    				slotDuration: "00:30",
    				scrollTime: "09:00:00",
    				slotMinTime: "09:00:00",
    				slotMaxTime: "22:00:00",
    				allDaySlot: false,
    				expandRows: true,
    				height: "auto",
    				buttonText: {
    					today: "aujourd'hui",
    					month: "mois",
    					week: "semaine",
    					day: "jour",
    					list: "liste",
    					month: "vue mois",
    					week: "vue semaine"
    				},
    				headerToolbar: {
    					right: "today",
    					center: "title",
    					left: "prev,next"
    				},
    				weekNumbers: true,
    				weekText: "S",
    				selectLongPressDelay: 1000,
    				selectOverlap: false,
    				select(info) {
    					if (info.start > new Date()) {
    						$$invalidate(1, dataReservation = {
    							dateDebut: new Date(),
    							dateFin: new Date(),
    							idMachine: ""
    						});

    						$$invalidate(1, dataReservation.dateDebut = info.start, dataReservation);
    						$$invalidate(1, dataReservation.dateFin = info.end, dataReservation);
    						$$invalidate(2, flagReservation = true);
    					}
    				},
    				eventOverlap(stillEvent, movingEvent) {
    					return stillEvent.extendedProps.machine.id !== movingEvent.extendedProps.machine.id;
    				}
    			}));

    		calendar.render();

    		/* récup idResa si besoin */
    		extracted = (/\?idReservation=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i).exec(urlEffacerResa.search);

    		if (extracted !== null) {
    			console.log("extracted", extracted[1]);

    			reservationById({ id: extracted[1] }).then(retour => {
    				console.log("retour", retour);

    				if (retour.length > 0) {
    					$$invalidate(1, dataReservation = retour[0]);
    					$$invalidate(1, dataReservation.dateDebut = new Date(dataReservation.dateDebut), dataReservation);
    					$$invalidate(1, dataReservation.dateFin = new Date(dataReservation.dateFin), dataReservation);
    					$$invalidate(2, flagReservation = true);
    					$$invalidate(8, flagEffacerResa = true);
    				}
    			});
    		}
    	});

    	function fini() {
    		$$invalidate(2, flagReservation = false);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<ReservationsMachines> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("ReservationsMachines", $$slots, []);

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, calendarEl = $$value);
    		});
    	}

    	function input0_input_handler() {
    		userInfo.prenom = this.value;
    		$$invalidate(6, userInfo);
    	}

    	function input1_input_handler() {
    		userInfo.nom = this.value;
    		$$invalidate(6, userInfo);
    	}

    	function input2_input_handler() {
    		userInfo.email = this.value;
    		$$invalidate(6, userInfo);
    	}

    	function input3_change_handler() {
    		saveInfo = this.checked;
    		$$invalidate(5, saveInfo);
    	}

    	const actionBouton_handler = () => $$invalidate(10, flagConfirmationEffacerResa = true);

    	function dialog0_visible_binding(value) {
    		flagReservation = value;
    		$$invalidate(2, flagReservation);
    	}

    	const actionBouton_handler_1 = () => $$invalidate(10, flagConfirmationEffacerResa = false);

    	function dialog1_visible_binding(value) {
    		flagConfirmationEffacerResa = value;
    		$$invalidate(10, flagConfirmationEffacerResa);
    	}

    	function dialog2_visible_binding(value) {
    		flagEffaceOK = value;
    		$$invalidate(11, flagEffaceOK);
    	}

    	$$self.$capture_state = () => ({
    		onMount,
    		Calendar,
    		timeGridPlugin: main$1,
    		dayGridPlugin: main,
    		interactionPlugin: main$2,
    		Dialog,
    		Bouton,
    		Fa,
    		faArrowLeft,
    		faTrashAlt,
    		faSave,
    		listePlagesHoraires,
    		sauveReservation,
    		listeReservations,
    		reservationById,
    		effacerReservation,
    		envoyerMail,
    		tableCouleursLBF,
    		calendarEl,
    		calendar,
    		flagBH,
    		urlEffacerResa,
    		businessHours,
    		nbPlagesJour,
    		dataReservation,
    		flagReservation,
    		laVue,
    		jourDebutCalendrier,
    		horaireDebut,
    		horaireFin,
    		minutesDebut,
    		minutesFin,
    		options,
    		saveInfo,
    		userInfo,
    		busySauverReservation,
    		flagEffacerResa,
    		busyEffacerResa,
    		flagConfirmationEffacerResa,
    		flagEffaceOK,
    		extracted,
    		effaceReservation,
    		retourSite,
    		sauverReservation,
    		mailConfirmation,
    		fini
    	});

    	$$self.$inject_state = $$props => {
    		if ("calendarEl" in $$props) $$invalidate(0, calendarEl = $$props.calendarEl);
    		if ("calendar" in $$props) $$invalidate(17, calendar = $$props.calendar);
    		if ("flagBH" in $$props) flagBH = $$props.flagBH;
    		if ("businessHours" in $$props) $$invalidate(18, businessHours = $$props.businessHours);
    		if ("nbPlagesJour" in $$props) nbPlagesJour = $$props.nbPlagesJour;
    		if ("dataReservation" in $$props) $$invalidate(1, dataReservation = $$props.dataReservation);
    		if ("flagReservation" in $$props) $$invalidate(2, flagReservation = $$props.flagReservation);
    		if ("laVue" in $$props) laVue = $$props.laVue;
    		if ("jourDebutCalendrier" in $$props) jourDebutCalendrier = $$props.jourDebutCalendrier;
    		if ("horaireDebut" in $$props) $$invalidate(3, horaireDebut = $$props.horaireDebut);
    		if ("horaireFin" in $$props) $$invalidate(4, horaireFin = $$props.horaireFin);
    		if ("minutesDebut" in $$props) $$invalidate(19, minutesDebut = $$props.minutesDebut);
    		if ("minutesFin" in $$props) $$invalidate(20, minutesFin = $$props.minutesFin);
    		if ("saveInfo" in $$props) $$invalidate(5, saveInfo = $$props.saveInfo);
    		if ("userInfo" in $$props) $$invalidate(6, userInfo = $$props.userInfo);
    		if ("busySauverReservation" in $$props) $$invalidate(7, busySauverReservation = $$props.busySauverReservation);
    		if ("flagEffacerResa" in $$props) $$invalidate(8, flagEffacerResa = $$props.flagEffacerResa);
    		if ("busyEffacerResa" in $$props) $$invalidate(9, busyEffacerResa = $$props.busyEffacerResa);
    		if ("flagConfirmationEffacerResa" in $$props) $$invalidate(10, flagConfirmationEffacerResa = $$props.flagConfirmationEffacerResa);
    		if ("flagEffaceOK" in $$props) $$invalidate(11, flagEffaceOK = $$props.flagEffaceOK);
    		if ("extracted" in $$props) extracted = $$props.extracted;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*calendar, businessHours*/ 393216) {
    			 {
    				if (calendar) {
    					calendar.setOption("businessHours", businessHours);
    					calendar.setOption("eventConstraint", "businessHours");
    					calendar.setOption("selectConstraint", "businessHours");
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*dataReservation, minutesDebut, minutesFin*/ 1572866) {
    			 {
    				$$invalidate(19, minutesDebut = dataReservation.dateDebut.getMinutes() === 0
    				? "00"
    				: dataReservation.dateDebut.getMinutes());

    				$$invalidate(3, horaireDebut = dataReservation.dateDebut.getHours() + "h" + minutesDebut);

    				$$invalidate(20, minutesFin = dataReservation.dateFin.getMinutes() === 0
    				? "00"
    				: dataReservation.dateFin.getMinutes());

    				$$invalidate(4, horaireFin = dataReservation.dateFin.getHours() + "h" + minutesFin);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*busySauverReservation, calendar*/ 131200) {
    			 {
    				if (!busySauverReservation) {
    					listeReservations({ idMachine }).then(liste => {
    						calendar.removeAllEvents();

    						liste.forEach(resa => {
    							const resaEvent = {
    								id: resa.id,
    								title: "reservé",
    								start: resa.dateDebut,
    								end: resa.dateFin,
    								backgroundColor: tableCouleursLBF[resa.machine.couleur].numCouleur,
    								borderColor: tableCouleursLBF[resa.machine.couleur].numCouleur,
    								extendedProps: resa
    							};

    							calendar.addEvent(resaEvent);
    						});
    					});
    				}
    			}
    		}
    	};

    	return [
    		calendarEl,
    		dataReservation,
    		flagReservation,
    		horaireDebut,
    		horaireFin,
    		saveInfo,
    		userInfo,
    		busySauverReservation,
    		flagEffacerResa,
    		busyEffacerResa,
    		flagConfirmationEffacerResa,
    		flagEffaceOK,
    		options,
    		effaceReservation,
    		retourSite,
    		sauverReservation,
    		fini,
    		calendar,
    		businessHours,
    		minutesDebut,
    		minutesFin,
    		extracted,
    		flagBH,
    		urlEffacerResa,
    		nbPlagesJour,
    		laVue,
    		jourDebutCalendrier,
    		mailConfirmation,
    		div_binding,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler,
    		input3_change_handler,
    		actionBouton_handler,
    		dialog0_visible_binding,
    		actionBouton_handler_1,
    		dialog1_visible_binding,
    		dialog2_visible_binding
    	];
    }

    class ReservationsMachines extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {}, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ReservationsMachines",
    			options,
    			id: create_fragment$3.name
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
