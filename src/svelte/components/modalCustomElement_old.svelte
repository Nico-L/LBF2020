<svelte:options tag="le-modal"/>

<script>
	export let busy = false;
	export let workingMessage = "Processing...";

	import { createEventDispatcher, onDestroy } from "svelte";
	const dispatch = createEventDispatcher();
    const close = () => dispatch("close");
    const retour = () => dispatch("retour");
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
	const previously_focused =
	  typeof document !== "undefined" && document.activeElement;
	if (previously_focused) {
	  onDestroy(() => {
	    previously_focused.focus();
	  });
	}
</script>

<svelte:window on:keydown={handle_keydown}/>

<div class="fixed w-full h-full top-0 left-0 flex items-center justify-center">
<div class="absolute w-full h-full z-998 bg-black opacity-75 top-0 left-0 cursor-pointer" on:click={close}></div>
<div class="relative absolute w-5/6 sm:w-3/4 md:w-1/2 z-999 bg-white rounded-sm shadow-lg flex flex-col p-2 items-center justify-center rounded-lg" role="dialog" aria-modal="true" bind:this={modal}>
	{#if busy}
	<div class="absolute w-full h-full bg-white flex">
	<div class="mx-auto my-auto">
		<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current text-lbfvert-500 h-20 w-20 mx-auto" viewBox="0 0 50 50">
		<g fill="none" fill-rule="evenodd" stroke-width="2">
			<circle cx="22" cy="22" r="1">
				<animate attributeName="r" begin="0s" dur="1.8s" values="1; 20" calcMode="spline" keyTimes="0; 1" keySplines="0.165, 0.84, 0.44, 1" repeatCount="indefinite"/>
				<animate attributeName="stroke-opacity" begin="0s" dur="1.8s" values="1; 0" calcMode="spline" keyTimes="0; 1" keySplines="0.3, 0.61, 0.355, 1" repeatCount="indefinite"/>
			</circle>
			<circle cx="22" cy="22" r="1">
				<animate attributeName="r" begin="-0.9s" dur="1.8s" values="1; 20" calcMode="spline" keyTimes="0; 1" keySplines="0.165, 0.84, 0.44, 1" repeatCount="indefinite"/>
				<animate attributeName="stroke-opacity" begin="-0.9s" dur="1.8s" values="1; 0" calcMode="spline" keyTimes="0; 1" keySplines="0.3, 0.61, 0.355, 1" repeatCount="indefinite"/>
			</circle>
		</g>
	</svg>
	<div class="w-3/4 mx-auto">
	{workingMessage}
	</div>
	</div>
	</div>
	{/if}
	<slot name="titre"></slot>
	<slot name="sousTitre"></slot>
	<hr class="mb-2">
	<slot></slot>
	<hr>

	<!-- svelte-ignore a11y-autofocus -->
	<div class="w-full flex flex-row justify-end mt-4 mb-2 h-12 text-lg">
	<slot name="message"></slot>
	<slot name="boutonFonction" class="mx-1 border"></slot>
	<button on:click={retour} class="bg-orangeLBF mx-2 px-4 rounded">Fermer bob</button>
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