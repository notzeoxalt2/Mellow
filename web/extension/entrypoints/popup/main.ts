import './style.css';
import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL,
  type BridgeMethod,
  type BridgeResponse,
  type ParamsOf,
  type ResultOf,
  type SpotifyAuthState,
  type YtAuthState,
} from '@bitchord/shared/bridge';
import { syncToMellowDesktop } from '../../lib/desktopSync';

declare const __SITE_ORIGINS__: string[];

/** The popup asks the background, like the page does, so both see one state. */
async function call<M extends BridgeMethod>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
  const response = (await browser.runtime.sendMessage({
    channel: BRIDGE_CHANNEL,
    protocol: BRIDGE_PROTOCOL,
    direction: 'to-extension',
    id: `popup-${Date.now().toString(36)}`,
    method,
    params,
  })) as BridgeResponse<M>;
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function simpleRow(name: string, detail: string): HTMLLIElement {
  const row = el('li', 'row');
  row.append(el('span', 'label', name), el('span', 'value', detail));
  return row;
}

/** YouTube Music: who requests act as, and the way to stop (or start) using that session. */
function youtubeRow(state: YtAuthState | null, refresh: (state: YtAuthState) => void): HTMLLIElement {
  if (!state) return simpleRow('YouTube Music', 'Checking…');
  const row = el('li', 'row account');
  let avatar: HTMLElement = el('span', 'avatar');
  const who = el('span', 'who');
  let action: HTMLElement;

  if (!state.browserSignedIn) {
    who.append(el('span', 'title', 'YouTube Music'), el('span', 'detail', 'Not signed in in this browser'));
    const link = el('a', 'action', 'Sign in');
    (link as HTMLAnchorElement).href = 'https://music.youtube.com/';
    (link as HTMLAnchorElement).target = '_blank';
    action = link;
  } else if (!state.connected || !state.active) {
    const detail = el('span', 'detail', state.connected ? 'Couldn’t read your account' : 'Disconnected');
    if (state.problem) detail.title = state.problem;
    who.append(el('span', 'title', 'YouTube Music'), detail);
    if (state.connected) {
      action = el('button', 'action', 'Retry');
      action.onclick = () => void call('yt.authState', { refresh: true }).then(refresh);
    } else {
      action = el('button', 'action', 'Connect');
      action.onclick = () => void call('yt.setConnected', { connected: true }).then(refresh);
    }
  } else {
    if (state.active.avatarUrl) {
      const image = el('img', 'avatar');
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.src = state.active.avatarUrl;
      avatar = image;
    }
    who.append(el('span', 'title', state.active.name), el('span', 'detail', state.active.handle ?? 'YouTube Music'));
    action = el('button', 'action', 'Disconnect');
    action.title = 'Stop using this account in BitChord. You stay signed in to YouTube.';
    action.onclick = () => void call('yt.setConnected', { connected: false }).then(refresh);
  }
  row.append(avatar, who, action);
  if (state.problem) {
    const why = el('li', 'row problem', state.problem);
    return Object.assign(row, { problemRow: why });
  }
  return row;
}

function avatarOf(url: string | null | undefined): HTMLElement {
  if (!url) return el('span', 'avatar');
  const image = el('img', 'avatar');
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  image.src = url;
  return image;
}

function spotifyRow(state: SpotifyAuthState | null): HTMLElement {
  if (!state) return simpleRow('Spotify', 'Checking…');
  const row = el('li', 'row account');
  const who = el('span', 'who');
  let action: HTMLElement;

  if (!state.browserSignedIn) {
    who.append(el('span', 'title', 'Spotify'), el('span', 'detail', 'Not signed in in this browser'));
    const link = el('a', 'action', 'Sign in');
    (link as HTMLAnchorElement).href = 'https://open.spotify.com/';
    (link as HTMLAnchorElement).target = '_blank';
    action = link;
  } else if (!state.connected || !state.signedIn) {
    who.append(el('span', 'title', 'Spotify'), el('span', 'detail', state.connected ? 'Couldn’t mint a token' : 'Disconnected'));
    action = el('button', 'action', state.connected ? 'Retry' : 'Connect');
    action.onclick = () => void call('spotify.setConnected', { connected: true }).then(setSpotify);
  } else {
    who.append(el('span', 'title', state.user?.name ?? 'Spotify Account'), el('span', 'detail', 'Connected'));
    action = el('button', 'action', 'Disconnect');
    action.onclick = () => void call('spotify.setConnected', { connected: false }).then(setSpotify);
  }
  row.append(avatarOf(state.user?.avatarUrl), who, action);
  return row;
}

function mellowRow(): HTMLElement {
  const row = el('li', 'row account');
  const who = el('span', 'who');
  who.append(el('span', 'title', 'Mellow Desktop'), el('span', 'detail', mellowStatus));

  const button = el('button', 'action', 'Sync to Mellow');
  button.onclick = async () => {
    button.textContent = 'Syncing…';
    const ok = await syncToMellowDesktop();
    mellowStatus = ok ? 'Synced successfully!' : 'Mellow not open';
    render();
  };
  row.append(avatarOf(null), who, button);
  return row;
}

const list = document.getElementById('integrations')!;
let youtubeState: YtAuthState | null = null;
let spotifyState: SpotifyAuthState | null = null;
let mellowStatus = 'Checking…';

function render(): void {
  const youtube = youtubeRow(youtubeState, setYoutube) as HTMLLIElement & { problemRow?: HTMLLIElement };
  list.replaceChildren(
    youtube,
    ...(youtube.problemRow ? [youtube.problemRow] : []),
    spotifyRow(spotifyState),
    mellowRow(),
  );
}

function setYoutube(state: YtAuthState): void {
  youtubeState = state;
  render();
}
function setSpotify(state: SpotifyAuthState): void {
  spotifyState = state;
  render();
}
document.getElementById('version')!.textContent = `v${browser.runtime.getManifest().version}`;
const site = document.getElementById('site') as HTMLAnchorElement;
site.href = __SITE_ORIGINS__[0] ?? '#';

render();
call('yt.authState', {})
  .then(setYoutube)
  .catch(() => list.replaceChildren(simpleRow('YouTube Music', 'Couldn’t read the session')));
call('spotify.authState', {}).then(setSpotify).catch(() => undefined);

// Auto sync to Mellow Desktop when popup is opened
syncToMellowDesktop().then((ok) => {
  mellowStatus = ok ? 'Active & Synced' : 'Desktop app not running';
  render();
});
