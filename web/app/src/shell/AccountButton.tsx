import { ArrowUpRight, ChevronsUpDown } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '@/components/Menu';
import { useRefreshYtAuth, useSelectChannel, useSetConnected, useYtAuth } from '@/extension/useYtAuth';
import { useSpotifyAuth } from '@/extension/useSpotifyAuth';

const SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https://music.youtube.com/';

// The signed-out pill: Mellow's purple "Sign In"
const pill =
  'self-start rounded-[16px] bg-key px-3.5 py-[5px] type-[600_13px/18px] text-white hover:brightness-[1.08] disabled:opacity-60 cursor-pointer';
const avatar = 'inline-grid flex-none place-items-center rounded-full bg-quinary object-cover type-[600_11px/1] text-secondary';

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  return src ? (
    <img className={avatar} src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className={avatar} style={{ width: size, height: size }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * The sidebar's account control (avatar and name at the bottom,
 * opening the account menu; a clean profile when synced).
 */
export function AccountButton() {
  const status = useYtAuth();
  const spotifyAuth = useSpotifyAuth();
  const select = useSelectChannel();
  const connect = useSetConnected();
  const refresh = useRefreshYtAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);

  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;

  if (status.state !== 'ready') return null;
  const { auth } = status;
  const spotifyIdentity = isDesktop && spotifyAuth.state === 'ready' && spotifyAuth.auth.signedIn
    ? spotifyAuth.auth.user
    : null;

  // Desktop keeps the familiar Spotify profile in the sidebar. Selecting it
  // opens the YouTube sign-in flow only when the saved YT session needs repair.
  if (isDesktop && (!auth.browserSignedIn || !auth.connected || !auth.active)) {
    const displayName = spotifyIdentity?.name ?? 'Mellow';
    return (
      <button
        className="flex w-full min-w-0 items-center gap-2 rounded-nav px-1 py-1.5 text-start type-body-reduced text-primary hover:bg-quinary"
        title={auth.problem ?? 'Connect YouTube Music'}
        aria-label={`${displayName}. Connect YouTube Music`}
        onClick={() => window.electronAPI?.openGoogleLogin?.()}
      >
        <Avatar src={spotifyIdentity?.avatarUrl ?? null} name={displayName} size={24} />
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        <ChevronsUpDown size={14} strokeWidth={2} className="flex-none text-secondary" />
      </button>
    );
  }

  if (!auth.browserSignedIn) {
    return (
      <a className={pill} href={SIGN_IN_URL} target="_blank" rel="noreferrer">
        Sign In
      </a>
    );
  }

  if (!auth.connected) {
    return (
      <button className={pill} onClick={() => connect.mutate(true)} disabled={connect.isPending}>
        Connect YouTube Music
      </button>
    );
  }

  if (!auth.active) {
    return (
      <button
        className={pill}
        title={auth.problem ?? undefined}
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
      >
        {refresh.isPending ? 'Reading account…' : 'Retry YouTube Sign-In'}
      </button>
    );
  }

  const active = auth.active;
  const displayName = spotifyIdentity?.name ?? active.name;
  const displayAvatar = spotifyIdentity?.avatarUrl ?? active.avatarUrl;
  const multiple = auth.accounts.flatMap((a) => a.channels).length > 1;

  return (
    <>
      <button
        // Signed in: a 24px avatar and the name, opening the account menu.
        className="flex w-full min-w-0 items-center gap-2 rounded-nav px-1 py-1.5 text-start type-body-reduced text-primary hover:bg-quinary aria-expanded:bg-quinary"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
      >
        <Avatar src={displayAvatar} name={displayName} size={24} />
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        {multiple && <ChevronsUpDown size={14} strokeWidth={2} className="flex-none text-secondary" />}
      </button>
      {anchor && (
        <Menu anchor={anchor} placement="above-start" onClose={close} label="Account">
          {auth.accounts.map((account) => (
            <div key={account.authUser} role="group" aria-label={account.email ?? account.name}>
              <MenuHeader>{account.email ?? account.name}</MenuHeader>
              {account.channels.map((channel) => (
                <MenuItem
                  key={channel.id}
                  checked={channel.id === active.id}
                  icon={<Avatar src={channel.avatarUrl} name={channel.name} size={20} />}
                  trailing={channel.brand ? 'Brand' : undefined}
                  onSelect={() => {
                    close();
                    if (channel.id !== active.id) select.mutate(channel.id);
                  }}
                >
                  <span className="truncate">{channel.name}</span>
                </MenuItem>
              ))}
            </div>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<ArrowUpRight size={16} />}
            onSelect={() => {
              close();
              window.open(SIGN_IN_URL, '_blank', 'noreferrer');
            }}
          >
            Switch Accounts on YouTube
          </MenuItem>
          <MenuItem
            destructive
            onSelect={() => {
              close();
              connect.mutate(false);
            }}
          >
            Disconnect YouTube Music
          </MenuItem>
        </Menu>
      )}
    </>
  );
}
