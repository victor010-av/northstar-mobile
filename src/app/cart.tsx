import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { loadSharedCart, removeSharedCartItem, setSharedCartQuantity, type SharedCartItem } from '@/lib/shared-cart';
import { getProductImageUrl } from '@/lib/product-images';
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

function formatPrice(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function CartScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cartItems, setCartItems] = useState<SharedCartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    let authEventReceived = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      if (isMounted) {
        setSession(nextSession);
        setAuthLoading(false);
      }
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (isMounted && !authEventReceived) setSession(data.session);
      })
      .catch((error: unknown) => {
        if (isMounted) setErrorMessage(error instanceof Error ? error.message : 'Could not check your sign-in status.');
      })
      .finally(() => {
        if (isMounted) setAuthLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadCart = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) {
      setCartItems([]);
      return;
    }

    setErrorMessage('');
    setCartLoading(true);
    try {
      setCartItems(await loadSharedCart(userId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load your shared cart.');
    } finally {
      setCartLoading(false);
      setRefreshing(false);
    }
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => {
    if (!authLoading) void loadCart();
  }, [authLoading, loadCart]));

  async function changeQuantity(item: SharedCartItem, quantity: number) {
    const userId = session?.user.id;
    if (!userId || quantity < 1) return;
    setBusyItemId(item.id);
    setErrorMessage('');
    try {
      await setSharedCartQuantity(userId, item.id, quantity);
      setCartItems((items) => items.map((current) => current.id === item.id ? { ...current, quantity } : current));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update the quantity.');
    } finally {
      setBusyItemId(null);
    }
  }

  async function removeItem(item: SharedCartItem) {
    const userId = session?.user.id;
    if (!userId) return;
    setBusyItemId(item.id);
    setErrorMessage('');
    try {
      await removeSharedCartItem(userId, item.id);
      setCartItems((items) => items.filter((current) => current.id !== item.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not remove this item.');
    } finally {
      setBusyItemId(null);
    }
  }

  const subtotal = cartItems.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0);
  const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

  if (authLoading) {
    return <SafeAreaView style={styles.safeArea} edges={['top']}><View style={styles.centerState}><ActivityIndicator color={COLORS.green} /><Text style={styles.stateBody}>Checking your account…</Text></View></SafeAreaView>;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerState}>
          <Text style={styles.stateMark}>N</Text>
          <Text style={styles.title}>Your shared cart</Text>
          <Text style={styles.stateBody}>Sign in with Google to see and manage your cart across Northstar Shop on web and mobile.</Text>
          <Link href="/account" asChild>
            <Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>Go to sign in</Text></Pressable>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        data={cartItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <CartRow
            item={item}
            busy={busyItemId === item.id}
            onIncrease={() => void changeQuantity(item, item.quantity + 1)}
            onDecrease={() => void changeQuantity(item, item.quantity - 1)}
            onRemove={() => void removeItem(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>YOUR SELECTION</Text>
            <Text style={styles.title}>Your cart.</Text>
            <Text style={styles.subtitle}>{itemCount} {itemCount === 1 ? 'item' : 'items'} in your shared cart</Text>
          </View>
        }
        ListEmptyComponent={
          cartLoading ? (
            <View style={styles.centerState}><ActivityIndicator color={COLORS.green} /><Text style={styles.stateBody}>Loading your shared cart…</Text></View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.stateMark}>✦</Text>
              <Text style={styles.emptyTitle}>Your cart is taking a little break.</Text>
              <Text style={styles.stateBody}>Add something from the collection and it will be here on your other devices, too.</Text>
              <Link href="/" asChild><Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>Browse the collection</Text></Pressable></Link>
            </View>
          )
        }
        ListFooterComponent={cartItems.length ? (
          <View style={styles.summary}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text></View>
            <View style={[styles.summaryRow, styles.totalRow]}><Text style={styles.totalLabel}>Cart total</Text><Text style={styles.totalValue}>{formatPrice(subtotal)}</Text></View>
            <Text style={styles.summaryNote}>Product prices come from the Northstar catalog. Checkout is handled on the web.</Text>
          </View>
        ) : null}
        ListFooterComponentStyle={styles.footer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadCart(); }} tintColor={COLORS.green} />}
        showsVerticalScrollIndicator={false}
      />
      {errorMessage ? <View style={styles.errorBanner}><Text style={styles.errorText}>{errorMessage}</Text><Pressable onPress={() => { setErrorMessage(''); void loadCart(); }}><Text style={styles.retryText}>Retry</Text></Pressable></View> : null}
    </SafeAreaView>
  );
}

function CartRow({ item, busy, onIncrease, onDecrease, onRemove }: {
  item: SharedCartItem;
  busy: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  const rawImageUrl = typeof item.product.image_url === 'string' ? item.product.image_url.trim() : '';
  const imageUrl = rawImageUrl ? getProductImageUrl(rawImageUrl) : '';
  const price = Number(item.product.price);
  const lineTotal = price * item.quantity;

  return (
    <View style={styles.cartRow}>
      <View style={styles.productImageFrame}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.productImage} contentFit="cover" accessibilityLabel={item.product.name || 'Product image'} /> : <View style={styles.imagePlaceholder}><Text style={styles.placeholderMark}>N</Text></View>}
      </View>
      <View style={styles.productDetails}>
        <Text style={styles.productName} numberOfLines={2}>{item.product.name || 'Product'}</Text>
        <Text style={styles.unitPrice}>{formatPrice(price)} each</Text>
        <View style={styles.quantityAndTotal}>
          <View style={styles.quantityControl}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Decrease quantity for ${item.product.name}`} disabled={busy || item.quantity <= 1} onPress={onDecrease} style={styles.quantityButton}><Text style={styles.quantityButtonText}>−</Text></Pressable>
            <Text style={styles.quantityText}>{busy ? '…' : item.quantity}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Increase quantity for ${item.product.name}`} disabled={busy} onPress={onIncrease} style={styles.quantityButton}><Text style={styles.quantityButtonText}>+</Text></Pressable>
          </View>
          <Text style={styles.lineTotal}>{formatPrice(lineTotal)}</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onRemove} hitSlop={6}><Text style={styles.removeText}>{busy ? 'Updating…' : 'Remove item'}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  listContent: { paddingHorizontal: 20, paddingBottom: 30, flexGrow: 1 },
  header: { paddingTop: 22, paddingBottom: 20 },
  eyebrow: { color: COLORS.green, fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginBottom: 8 },
  title: { color: COLORS.ink, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -1 },
  subtitle: { color: COLORS.muted, fontSize: 13, marginTop: 7 },
  cartRow: { flexDirection: 'row', padding: 12, marginBottom: 12, borderRadius: 15, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line },
  productImageFrame: { width: 88, height: 88, borderRadius: 11, overflow: 'hidden', backgroundColor: COLORS.paleGreen },
  productImage: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderMark: { color: '#849487', fontSize: 22, fontWeight: '700' },
  productDetails: { flex: 1, minWidth: 0, marginLeft: 12 },
  productName: { color: COLORS.ink, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  unitPrice: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  quantityAndTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: COLORS.line },
  quantityButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { color: COLORS.green, fontSize: 17, fontWeight: '600' },
  quantityText: { color: COLORS.ink, minWidth: 20, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  lineTotal: { color: COLORS.ink, fontSize: 13, fontWeight: '700', flexShrink: 0 },
  removeText: { color: COLORS.muted, fontSize: 11, textDecorationLine: 'underline', marginTop: 8, alignSelf: 'flex-start' },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyState: { alignItems: 'center', paddingHorizontal: 18, paddingVertical: 34 },
  stateMark: { width: 44, height: 44, lineHeight: 44, borderRadius: 22, textAlign: 'center', color: COLORS.green, backgroundColor: COLORS.paleGreen, fontSize: 21, fontWeight: '700', overflow: 'hidden', marginBottom: 14 },
  emptyTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  stateBody: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  primaryButton: { minHeight: 44, paddingHorizontal: 17, paddingVertical: 12, marginTop: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.green },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  summary: { padding: 18, marginTop: 8, borderRadius: 15, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryLabel: { color: COLORS.muted, fontSize: 13 },
  summaryValue: { color: COLORS.ink, fontSize: 13, fontWeight: '600' },
  totalRow: { paddingTop: 12, marginBottom: 0, borderTopWidth: 1, borderTopColor: COLORS.line },
  totalLabel: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  totalValue: { color: COLORS.green, fontSize: 17, fontWeight: '700' },
  summaryNote: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 12 },
  footer: { flexGrow: 1, justifyContent: 'flex-end' },
  errorBanner: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.errorBackground, paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { color: COLORS.error, fontSize: 12, lineHeight: 17, flex: 1 },
  retryText: { color: COLORS.error, fontSize: 12, fontWeight: '700' },
});
