<svelte:options tag="mon-modal"/>

<script>
    import { createEventDispatcher, onDestroy, onMount, tick } from "svelte";
    import { get_current_component } from "svelte/internal"

    export let has_bouton_bleu = false;

    var actionEncours = false
    //const dispatch = createEventDispatcher();

    const component = get_current_component()
    const svelteDispatch = createEventDispatcher()
    const dispatch = (name, detail) => {
        svelteDispatch(name, detail)
        component.dispatchEvent && component.dispatchEvent(new CustomEvent(name, { detail }))
    }

    const close = () => dispatch("close");
    const boutonBleu = () => dispatch("boutonBleu")

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
</script>

<svelte:window on:keydown={handle_keydown}/>

<div class="z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center">
    <div class="absolute w-full h-full bg-black opacity-75 top-0 left-0 cursor-pointer" on:click={close}></div>
    <div class="relative overflow-auto bg-white p-2 rounded" role="dialog" aria-modal="true" bind:this={modal}>
            <h2 class="text-xl w-full pb-1 mb-1 border-b-2 border-bleuLBF font-bold">
                <slot name="titre">Un titre</slot>
            </h2>
            <div class="mx-2"><slot>Le corps de la fenêtre</slot> </div>
            <div class="flex justify-end mt-3 mx-2">
                <button on:click={close} class="mx-1 px-1 border-2 border-orangeLBF rounded text-base font-medium text-orangeLBF">
                    Annuler
                </button>
                {#if has_bouton_bleu}
                    <button on:click={boutonBleu} class="mx-1 px-1 border-2 border-bleuLBF rounded text-base font-medium text-bleuLBF">
                        <slot name="boutonBleu">BoutonBleu</slot>
                    </button>
                {/if}
            </div>
    </div>
</div>

<style>
/* purgecss start ignore */
@import "tailwindcss/base";
/* purgecss end ignore */

/* purgecss start ignore */
@import "tailwindcss/components";
/* purgecss end ignore */

@import "tailwindcss/utilities";
</style>