/**
 * Back-compat re-exports of official Phantom provider helpers.
 * Prefer importing from ./phantom-official in new code.
 */

export {
  getPhantomProvider as resolvePhantomProvider,
  isPhantomInstalled as isPhantomProviderPresent,
  PHANTOM_INSTALL_URL,
  PHANTOM_INSTALL_MESSAGE,
  type OfficialPhantomProvider as PhantomSolanaProvider,
  type PhantomWindowLike,
} from "./phantom-official";
