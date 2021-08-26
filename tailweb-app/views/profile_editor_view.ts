/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { css, html } from '../deps_app.ts';
import { TailwebAppVM } from '../tailweb_app_vm.ts';

export const PROFILE_EDITOR_HTML = html`
<form id="profile-form" autocomplete="off">
<fieldset id="profile-fieldset">
  <div id="profile-form-title" class="h6 high-emphasis-text">Profile</div>

  <label for="profile-name">Profile name:</label>
  <input id="profile-name" type="text">

  <label for="account-id">Cloudflare Account ID:</label>
  <input id="profile-account-id" type="text">

  <label for="api-token">Cloudflare API Token:</label>
  <input id="profile-api-token" type="text">

  <details id="profile-form-help-row" class="form-row">
    <summary>Use a <a href="https://en.wikipedia.org/wiki/Principle_of_least_privilege" target="_blank">least privilege</a> token with <code>Account &gt; Workers Tail &gt; Read</code></summary>
    <div>Manage tokens on the Cloudflare dashboard <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">API Tokens</a> page.</div>
  </details>  

  <div id="profile-form-output-row" class="form-row">
    <output id="profile-form-output"></output>
    <progress id="profile-form-progress" class="pure-material-progress-circular"></progress>
  </div>

  <div class="form-lhs">
    <button id="profile-delete">Delete</button>
  </div>
  <div id="profile-form-buttons" class="form-rhs">
    <button id="profile-cancel">Cancel</button>
    <button id="profile-save">Save</button>
  </div>
</fieldset>
</form>
`;

export const PROFILE_EDITOR_CSS = css`

    #profile-form-buttons {
        justify-self: end;
        display: flex;
        gap: 1rem;
    }

    #profile-form-help-row {
        cursor: pointer;
    }

    #profile-form-help-row summary {
        user-select: none;
    }

    #profile-form-help-row div {
        margin: 1rem;
        cursor: default
    }

    #profile-form-output-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-height: 2.5rem;
    }

    #profile-form-output-row output {
        flex-grow: 1;
    }

    #profile-form-progress {
        font-size: 0.5rem; /* default 3em => 1.5rem */
    }

`;

export function initProfileEditor(document: HTMLDocument, vm: TailwebAppVM): () => void {
    const profileForm = document.getElementById('profile-form') as HTMLFormElement;
    const profileFormTitleDiv = document.getElementById('profile-form-title') as HTMLElement;
    const profileFieldset = document.getElementById('profile-fieldset') as HTMLFieldSetElement;
    const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
    const profileAccountIdInput = document.getElementById('profile-account-id') as HTMLInputElement;
    const profileApiTokenInput = document.getElementById('profile-api-token') as HTMLInputElement;
    const profileDeleteButton = document.getElementById('profile-delete') as HTMLButtonElement;
    const profileCancelButton = document.getElementById('profile-cancel') as HTMLButtonElement;
    const profileSaveButton = document.getElementById('profile-save') as HTMLButtonElement;
    const profileFormProgress = document.getElementById('profile-form-progress') as HTMLProgressElement;
    const profileFormOutput = document.getElementById('profile-form-output') as HTMLOutputElement;
    const profileFormHelpDetails = document.getElementById('profile-form-help-row') as HTMLDetailsElement;

    profileCancelButton.onclick = e => {
        e.preventDefault();
        vm.cancelProfile();
    }
    profileNameInput.oninput = () => {
        vm.setProfileName(profileNameInput.value);
    }
    profileAccountIdInput.oninput = () => {
        vm.setProfileAccountId(profileAccountIdInput.value);
    }
    profileApiTokenInput.oninput = () => {
        vm.setProfileApiToken(profileApiTokenInput.value);
    }
    profileSaveButton.onclick = e => {
        e.preventDefault();
        vm.saveProfile();
    }
    profileDeleteButton.onclick = e => {
        e.preventDefault();
        vm.deleteProfile(vm.profileForm.profileId);
    }

    return () => {
        const wasHidden = profileForm.style.display === 'none';
        profileForm.style.display = vm.profileForm.showing ? 'grid' : 'none';
        profileFieldset.disabled = !vm.profileForm.enabled;
        profileFormTitleDiv.textContent = vm.profileForm.title;
        profileNameInput.value = vm.profileForm.name;
        profileAccountIdInput.value = vm.profileForm.accountId;
        profileApiTokenInput.value = vm.profileForm.apiToken;
        profileDeleteButton.style.display = vm.profileForm.deleteVisible ? 'inline-block' : 'none';
        profileSaveButton.disabled = !vm.profileForm.saveEnabled;
        profileFormProgress.style.display = vm.profileForm.progressVisible ? 'block' : 'none';
        profileFormOutput.textContent = vm.profileForm.outputMessage;
        if (wasHidden && vm.profileForm.showing) {
            // console.log('profile form open');
            profileFormHelpDetails.open = false; // collapse details
            setTimeout(() => { 
                profileNameInput.focus();
                profileNameInput.select(); 
            }, 0); 
        }
    };    
}