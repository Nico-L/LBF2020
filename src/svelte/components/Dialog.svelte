<script>
import { createEventDispatcher } from 'svelte';
const dispatch = createEventDispatcher();
import { fade } from "svelte/transition";
import { quadOut, quadIn } from "svelte/easing";
import { scale } from "svelte/transition";

export let visible = false;
export let persistant = false;
export let opacity = 0.7;

let inProps = { duration: 150, easing: quadIn };
let outProps = { duration: 150, easing: quadOut };
let transitionProps = { duration: 100, easing: quadIn, delay: 0 };

</script>

{#if visible}
  <div class="fixed w-full h-full top-0 left-0 z-200 overflow-y-auto">
    <div
        class="bg-lbfbleu-900 fixed top-0 left-0 z-10 w-full h-full"
        style="opacity: {opacity}"
        in:fade={inProps}
        out:fade={outProps}
        on:click={() => {if(visible && !persistant) {dispatch('close')}}} />
    <div class="h-full w-full absolute flex items-start justify-center pt-12">
        <div
        in:scale={transitionProps}
        out:scale={transitionProps}
        class="items-start z-50 rounded bg-gray-100 p-4 elevation-4 max-w-5/6">
        <div class="h3">
            <slot name="title" />
        </div>
        <slot />
        <div class="flex flex-row w-full justify-end items-center pt-2 mt-3 border-t-2 border-gray-400">
            <slot name="actions" />
        </div>
        </div>
    </div>
  </div>
{/if}