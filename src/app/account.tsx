import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

const COLORS = {
  background: '#F7F6F2',
  card: '#FFFFFF',
  ink: '#1D2A24',
  muted: '#7A817B',
  green: '#245B43',
  paleGreen: '#E7F0E9',
  line: '#E8E8E1',
  error: '#A64236',
  errorBackground: '#FBEDEA',
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AccountScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    let authEventReceived = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      if (isMounted) {
        setSession(nextSession);
        setLoading(false);
        setErrorMessage('');
      }
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (isMounted && !authEventReceived) setSession(data.session);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not check your sign-in status.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle() {
    setBusy(true);
    setErrorMessage('');

    try {
      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
        return;
      }

      const redirectTo = Linking.createURL('account');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Supabase did not return a Google sign-in URL.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') {
        if (result.type === 'cancel' || result.type === 'dismiss') {
          setErrorMessage('Sign-in was cancelled. You can try again anytime.');
        }
        return;
      }

      const { queryParams } = Linking.parse(result.url);
      const oauthError = firstParam(queryParams?.error_description) ?? firstParam(queryParams?.error);
      if (oauthError) throw new Error(oauthError);

      const code = firstParam(queryParams?.code);
      if (!code) throw new Error('Google sign-in did not return an authorization code. Please try again.');

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not sign in with Google. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setErrorMessage('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not log out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const user = session?.user;
  const fullName = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  const displayName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : user?.email;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>N</Text></View>
          <Text style={styles.brandName}>northstar<Text style={styles.brandPeriod}>.</Text></Text>
        </View>

        <View style={styles.accountCard}>
          <Text style={styles.eyebrow}>YOUR NORTHSTAR</Text>
          <Text style={styles.title}>{user ? 'Welcome back.' : 'Your account.'}</Text>
          <Text style={styles.subtitle}>
            {user ? 'You’re signed in and ready to shop.' : 'Sign in with the Google account you already use on Northstar Shop.'}
          </Text>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.green} />
              <Text style={styles.loadingText}>Checking your account…</Text>
            </View>
          ) : user ? (
            <View style={styles.signedInPanel}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(displayName?.[0] ?? 'N').toUpperCase()}</Text></View>
              <View style={styles.identity}>
                <Text style={styles.identityName} numberOfLines={1}>{displayName || 'Northstar customer'}</Text>
                {user.email ? <Text style={styles.identityEmail} numberOfLines={2}>{user.email}</Text> : null}
              </View>
              <View style={styles.statusDot} />
            </View>
          ) : null}

          {!loading ? (
            user ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void signOut()}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, busy && styles.disabledButton]}>
                {busy ? <ActivityIndicator color={COLORS.green} /> : <Text style={styles.secondaryButtonText}>Log out</Text>}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void signInWithGoogle()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabledButton]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <>
                  <Text style={styles.googleMark}>G</Text>
                  <Text style={styles.primaryButtonText}>Continue with Google</Text>
                </>}
              </Pressable>
            )
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.footerNote}>One account, wherever you shop.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  brandMark: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  brandName: { color: COLORS.ink, fontSize: 25, fontWeight: '700', letterSpacing: -1 },
  brandPeriod: { color: COLORS.green },
  accountCard: { width: '100%', maxWidth: 420, borderRadius: 22, padding: 24, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line },
  eyebrow: { color: COLORS.green, fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginBottom: 11 },
  title: { color: COLORS.ink, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -1 },
  subtitle: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  loadingRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: COLORS.muted, fontSize: 13 },
  signedInPanel: { minHeight: 68, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: COLORS.paleGreen, marginBottom: 18 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  identity: { flex: 1, minWidth: 0, marginLeft: 11 },
  identityName: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  identityEmail: { color: COLORS.ink, fontSize: 13, fontWeight: '600', marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4F9A62', marginLeft: 8 },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: COLORS.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, paddingHorizontal: 16 },
  googleMark: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: COLORS.green, fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.72 },
  pressed: { opacity: 0.85 },
  errorBox: { backgroundColor: COLORS.errorBackground, borderRadius: 10, padding: 12, marginTop: 14 },
  errorText: { color: COLORS.error, fontSize: 12, lineHeight: 18 },
  footerNote: { color: COLORS.muted, fontSize: 12, marginTop: 22 },
});
