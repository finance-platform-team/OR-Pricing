/** Signed-in user chip in the top bar. */
import { getCurrentUser } from '../data/dataverse';
import { S } from '../state';
import { byId } from '../ui/dom';

export async function loadUser(): Promise<void> {
  try {
    const user = await getCurrentUser();
    S.currentUserId = user.id;
    S.currentUserName = user.name || 'User';
    byId('userName').textContent = S.currentUserName;
    byId('userAv').textContent = S.currentUserName.charAt(0).toUpperCase();
  } catch (e) {
    console.warn('[USER] Could not load user:', e);
    byId('userName').textContent = 'User';
  }
}
