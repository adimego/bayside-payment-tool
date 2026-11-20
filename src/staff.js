// Staff auth, saved quotes, and the admin approval screen.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL } from './supabase-config.js?v=d95aa26';
import { quoteVehicleSnapshot, quoteDealSnapshot, quoteResultsSnapshot } from './share.js?v=d95aa26';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

let session = null;
let profile = null;
let authReady = false;
const listeners = new Set();

export function currentSession() { return session; }
export function currentProfile() { return profile; }
export function isSignedIn() { return Boolean(session?.user); }
export function isApprovedStaff() { return profile?.status === 'approved'; }
export function isAdmin() { return profile?.status === 'approved' && profile?.role === 'admin'; }

export function onStaffChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() { for (const fn of listeners) fn({ session, profile }); }

async function loadProfile() {
  profile = null;
  if (!session?.user) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, status, created_at, approved_at')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    return;
  }
  profile = data;
}

export async function initStaffAuth() {
  const { data } = await supabase.auth.getSession();
  session = data.session ?? null;
  await loadProfile();
  authReady = true;
  notify();
  supabase.auth.onAuthStateChange(async (event, next) => {
    session = next;
    await loadProfile();
    notify();
    if (event === 'PASSWORD_RECOVERY') {
      location.hash = '#/staff/password';
    }
  });
}

export function authRedirectTo() {
  return SITE_URL.endsWith('/') ? SITE_URL : `${SITE_URL}/`;
}

export async function requestAccount({ fullName, email, password, phone }) {
  const { data, error } = await supabase.auth.signUp({
    email: String(email || '').trim(),
    password,
    options: {
      emailRedirectTo: authRedirectTo(),
      data: {
        full_name: String(fullName || '').trim(),
        phone: String(phone || '').trim() || undefined,
      },
    },
  });
  return { data, error };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim(),
    password,
  });
  if (!error) {
    session = data.session;
    await loadProfile();
    notify();
  }
  return { data, error };
}

export async function signOut() {
  await supabase.auth.signOut();
  session = null;
  profile = null;
  notify();
}

export async function requestPasswordReset(email) {
  return supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
    redirectTo: authRedirectTo(),
  });
}

export async function updatePassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}

export async function saveQuote({ customerName, customerPhone, customerEmail, notes, stock, vehicle, deal, results }) {
  if (!isApprovedStaff()) return { error: { message: 'Your account is not approved yet.' } };
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      staff_id: session.user.id,
      customer_name: String(customerName || '').trim(),
      customer_phone: String(customerPhone || '').trim() || null,
      customer_email: String(customerEmail || '').trim() || null,
      notes: String(notes || '').trim() || null,
      stock: stock || null,
      vehicle: quoteVehicleSnapshot(vehicle),
      deal: quoteDealSnapshot(deal),
      results: quoteResultsSnapshot(results),
    })
    .select('id, slug, created_at')
    .single();
  return { data, error };
}

export async function listMyQuotes() {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, slug, customer_name, stock, vehicle, deal, results, notes, created_at, updated_at')
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function deleteQuote(id) {
  return supabase.from('quotes').delete().eq('id', id);
}

export async function getSharedQuote(slug) {
  const { data, error } = await supabase.rpc('get_shared_quote', { p_slug: slug });
  return { data, error };
}

export async function adminListProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, status, created_at, approved_at')
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function adminListQuotes() {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, slug, staff_id, customer_name, stock, vehicle, notes, created_at')
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function adminSetStatus(profileId, status) {
  const patch = { status };
  if (status === 'approved') {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = session.user.id;
  }
  return supabase.from('profiles').update(patch).eq('id', profileId);
}

export async function adminDeactivate(profileId) {
  return adminSetStatus(profileId, 'denied');
}

