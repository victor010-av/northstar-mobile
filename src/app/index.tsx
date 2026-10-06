import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { addProductToSharedCart } from '@/lib/shared-cart';
import { getProductImageUrl } from '@/lib/product-images';

type Row = Record<string, unknown>;
type Category = Row & { id?: string | number; name?: string };
type Product = Row & { id?: string | number; name?: string };

const COLORS = {
  background: '#F7F6F2',
  card: '#FFFFFF',
  ink: '#1D2A24',
  muted: '#7A817B',
  green: '#245B43',
  paleGreen: '#E7F0E9',
  line: '#E8E8E1',
  orange: '#B85C38',
};

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function productCategoryId(product: Product) {
  return product.category_id ?? product.categoryId;
}

function stockLabel(product: Product) {
  const rawStatus = asText(product.stock_status ?? product.status).toLowerCase();
  if (rawStatus.includes('out') || rawStatus.includes('sold')) return 'Out of stock';
  if (rawStatus.includes('low')) return 'Low stock';
  if (rawStatus.includes('stock') || rawStatus.includes('available')) return 'In stock';

  const quantity = product.stock_quantity ?? product.stock ?? product.inventory_quantity;
  if (typeof quantity === 'number') return quantity > 0 ? 'In stock' : 'Out of stock';
  if (typeof quantity === 'string' && quantity.trim() !== '') {
    return Number(quantity) > 0 ? 'In stock' : 'Out of stock';
  }
  if (product.in_stock === false || product.is_available === false) return 'Out of stock';
  if (product.in_stock === true || product.is_available === true) return 'In stock';
  return 'Availability varies';
}

function formatPrice(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    : 'Price unavailable';
}

function ProductCard({ product, onAdd, adding }: { product: Product; onAdd: (product: Product) => void; adding: boolean }) {
  const imageUrl = asText(product.image_url ?? product.imageUrl);
  const displayImageUrl = imageUrl ? getProductImageUrl(imageUrl) : '';
  const description = asText(product.description);
  const stock = stockLabel(product);
  const unavailable = stock === 'Out of stock';

  return (
    <View style={[styles.productCard, unavailable && styles.unavailableCard]}>
      <View style={styles.imageFrame}>
        {displayImageUrl ? (
          <Image
            source={{ uri: displayImageUrl }}
            style={styles.productImage}
            contentFit="cover"
            transition={180}
            accessibilityLabel={asText(product.name) || 'Product image'}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderMark}>✦</Text>
            <Text style={styles.placeholderText}>NORTHSTAR</Text>
          </View>
        )}
        {unavailable && <View style={styles.soldOverlay}><Text style={styles.soldText}>SOLD OUT</Text></View>}
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{asText(product.name) || 'Untitled product'}</Text>
        {description ? <Text style={styles.description} numberOfLines={2}>{description}</Text> : null}
        <Text style={styles.price}>{formatPrice(product.price)}</Text>
        <View style={styles.stockRow}>
          <View style={[styles.stockDot, unavailable && styles.stockDotOut, stock === 'Low stock' && styles.stockDotLow]} />
          <Text style={[styles.stockText, unavailable && styles.stockTextOut]}>{stock}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={adding || unavailable}
          onPress={() => onAdd(product)}
          style={({ pressed }) => [styles.addButton, (pressed || adding) && styles.addButtonPressed, unavailable && styles.addButtonDisabled]}>
          {adding ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.addButtonText}>{unavailable ? 'Out of stock' : 'Add to cart'}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export default function CatalogScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  async function addToCart(product: Product) {
    if (product.id === undefined || product.id === null) {
      setCartMessage('This product could not be added. Please refresh and try again.');
      return;
    }

    setAddingProductId(String(product.id));
    setCartMessage('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const user = data.session?.user;
      if (!user) {
        setCartMessage('Sign in from the Account tab before using your shared cart.');
        return;
      }

      await addProductToSharedCart(user.id, product.id);
      setCartMessage(`${asText(product.name) || 'Product'} added to your shared cart.`);
    } catch (addError) {
      setCartMessage(addError instanceof Error ? addError.message : 'Could not add this product to your cart.');
    } finally {
      setAddingProductId(null);
    }
  }

  const loadCatalog = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [categoryResult, productResult] = await Promise.all([
        supabase.from('categories').select('*'),
        supabase.from('products').select('*'),
      ]);

      if (categoryResult.error || productResult.error) {
        setError(categoryResult.error?.message ?? productResult.error?.message ?? 'Could not load the catalog.');
      } else {
        setCategories((categoryResult.data ?? []) as Category[]);
        setProducts((productResult.data ?? []) as Product[]);
      }
    } catch {
      setError('Check your connection and try loading the catalog again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = selectedCategory === null || String(productCategoryId(product)) === String(selectedCategory);
      const matchesSearch = !query || `${asText(product.name)} ${asText(product.description)}`.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const header = (
    <View>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}><Text style={styles.brandStar}>✦</Text></View>
          <Text style={styles.brandName}>northstar</Text>
        </View>
        <Text style={styles.edition}>THE EVERYDAY EDIT</Text>
      </View>

      <View style={styles.intro}>
        <Text style={styles.eyebrow}>THOUGHTFULLY CHOSEN</Text>
        <Text style={styles.headline}>Find your{ '\n' }next favorite.</Text>
        <Text style={styles.subheading}>Good things for wherever life takes you.</Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search the collection"
          placeholderTextColor={COLORS.muted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search products"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
            <Text style={styles.clearSearch}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Shop by category</Text>
        <Text style={styles.sectionCaption}>{categories.length} COLLECTIONS</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
        <CategoryChip label="All items" active={selectedCategory === null} onPress={() => setSelectedCategory(null)} />
        {categories.map((category, index) => {
          const id = category.id ?? category.name ?? index;
          return (
            <CategoryChip
              key={String(id)}
              label={asText(category.name) || 'Collection'}
              active={String(selectedCategory) === String(id)}
              onPress={() => setSelectedCategory(id)}
            />
          );
        })}
      </ScrollView>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{selectedCategory === null ? 'The collection' : categories.find((item) => String(item.id) === String(selectedCategory))?.name ?? 'The collection'}</Text>
        <Text style={styles.sectionCaption}>{visibleProducts.length} ITEMS</Text>
      </View>
      {cartMessage ? <Text style={styles.cartMessage} accessibilityLiveRegion="polite">{cartMessage}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        data={visibleProducts}
        keyExtractor={(item, index) => String(item.id ?? `${item.name ?? 'product'}-${index}`)}
        renderItem={({ item }) => <ProductCard product={item} onAdd={addToCart} adding={addingProductId === String(item.id)} />}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <View style={styles.stateBox}><ActivityIndicator color={COLORS.green} size="large" /><Text style={styles.stateTitle}>Gathering the good things…</Text></View>
          ) : error ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateGlyph}>↻</Text>
              <Text style={styles.stateTitle}>We couldn’t load the shop</Text>
              <Text style={styles.stateBody}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={() => void loadCatalog()}><Text style={styles.retryText}>Try again</Text></Pressable>
            </View>
          ) : (
            <View style={styles.stateBox}>
              <Text style={styles.stateGlyph}>✦</Text>
              <Text style={styles.stateTitle}>{products.length ? 'No matches just yet' : 'The shelves are being stocked'}</Text>
              <Text style={styles.stateBody}>{products.length ? 'Try another search or browse all items.' : 'Check back soon for the latest collection.'}</Text>
              {products.length > 0 && (search || selectedCategory !== null) ? (
                <Pressable style={styles.retryButton} onPress={() => { setSearch(''); setSelectedCategory(null); }}><Text style={styles.retryText}>Show all items</Text></Pressable>
              ) : null}
            </View>
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCatalog(true)} tintColor={COLORS.green} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function CategoryChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.categoryChip, active && styles.categoryChipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  listContent: { paddingHorizontal: 20, paddingBottom: 28 },
  topBar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.line },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  brandStar: { color: '#FFFFFF', fontSize: 15 },
  brandName: { color: COLORS.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.8 },
  edition: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.3 },
  intro: { paddingTop: 28, paddingBottom: 20 },
  eyebrow: { color: COLORS.orange, fontSize: 10, fontWeight: '700', letterSpacing: 1.7, marginBottom: 10 },
  headline: { color: COLORS.ink, fontSize: 38, lineHeight: 41, fontWeight: '700', letterSpacing: -1.8 },
  subheading: { color: COLORS.muted, fontSize: 14, marginTop: 10 },
  searchBox: { height: 48, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, marginBottom: 25 },
  searchIcon: { color: COLORS.green, fontSize: 23, marginRight: 8, marginTop: -3 },
  searchInput: { flex: 1, color: COLORS.ink, fontSize: 14, paddingVertical: 0 },
  clearSearch: { color: COLORS.muted, fontSize: 23, paddingHorizontal: 3 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.4, flexShrink: 1 },
  sectionCaption: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginLeft: 8 },
  categoryList: { gap: 8, paddingBottom: 25 },
  categoryChip: { borderRadius: 22, paddingHorizontal: 15, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card },
  categoryChipActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  categoryText: { color: COLORS.ink, fontSize: 12, fontWeight: '600' },
  categoryTextActive: { color: '#FFFFFF' },
  productRow: { gap: 12, marginBottom: 15 },
  productCard: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: 15, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line },
  unavailableCard: { opacity: 0.85 },
  imageFrame: { width: '100%', aspectRatio: 0.92, backgroundColor: '#EEF0E9', position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9EEE7' },
  placeholderMark: { color: '#93A895', fontSize: 30, marginBottom: 5 },
  placeholderText: { color: '#849487', fontSize: 8, fontWeight: '700', letterSpacing: 2 },
  soldOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(29,42,36,0.34)', alignItems: 'center', justifyContent: 'center' },
  soldText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  productInfo: { paddingHorizontal: 11, paddingTop: 10, paddingBottom: 12 },
  productName: { color: COLORS.ink, minHeight: 36, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  description: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 4, minHeight: 28 },
  price: { color: COLORS.green, fontSize: 14, fontWeight: '700', marginTop: 9 },
  stockRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 5 },
  stockDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5E9B6F' },
  stockDotOut: { backgroundColor: '#A3A8A2' },
  stockDotLow: { backgroundColor: '#D38A38' },
  stockText: { color: COLORS.muted, fontSize: 10 },
  stockTextOut: { color: COLORS.muted },
  addButton: { minHeight: 36, borderRadius: 10, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', marginTop: 11, paddingHorizontal: 8 },
  addButtonPressed: { opacity: 0.78 },
  addButtonDisabled: { backgroundColor: '#9BA49C' },
  addButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  cartMessage: { color: COLORS.green, fontSize: 12, lineHeight: 17, marginTop: -2, marginBottom: 14 },
  stateBox: { minHeight: 210, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 35 },
  stateGlyph: { color: COLORS.green, fontSize: 28, marginBottom: 9 },
  stateTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  stateBody: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  retryButton: { paddingHorizontal: 17, paddingVertical: 10, borderRadius: 20, backgroundColor: COLORS.green, marginTop: 16 },
  retryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
