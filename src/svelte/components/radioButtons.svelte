<script>
    import { createEventDispatcher } from "svelte";
    import Fa from 'svelte-fa'
    import { faCircle, faDotCircle } from '@fortawesome/free-regular-svg-icons'

    export let name = "";
    export let label = "";
    export let selected = "";
    export let value = "";
    export let mettreApres = false;
    export let cbClasses = "";
    const dispatch = createEventDispatcher();

    function modif() {
        selected=value
        dispatch("click")
    }
</script>

<div on:click={modif} class="cursor-pointer mx-2">
    <label class={"flex flex-row items-center " + cbClasses} for={name}>
        {#if mettreApres}
                <input
                    aria-label={label}
                    class="hidden"
                    type="radio"
                    role="radio"
                    {name}
                    id={name}
                    selected={selected === value}
                     />
            <div >
                {#if selected === value}
                    <Fa icon={faDotCircle} size="lg"/>
                {:else}
                    <Fa icon={faCircle} size="lg"/>
                {/if}
            </div>
            <div class="ml-2 text-base font-medium">
                {label}
            </div>
        {:else}
            <div class="mr-2 text-base font-medium">
                {label}
            </div>
            <div class="">
                {#if selected === value}
                    <Fa icon={faDotCircle} size="lg" />
                {:else}
                    <Fa icon={faCircle} size="lg" />
                {/if}
            </div>
                <input
                    aria-label={label}
                    class="hidden"
                    type="radio"
                    role="radio"
                    {name}
                    selected={selected === value} />
        {/if}
    </label>
</div>
