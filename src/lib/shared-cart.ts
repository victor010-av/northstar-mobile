import { supabase } from '@/lib/supabase';

export type CartProduct = Record<string, unknown> & {
  id: string | number;
  name?: string;
  price: number | string;
  image_url?: string | null;
  description?: string | null;
};

export type SharedCartItem = {
  id: string;
  product_id: string | number;
  quantity: number;
  product: CartProduct;
};

export async function loadSharedCart(userId: string): Promise<SharedCartItem[]> {
  const { data: rows, error: cartError } = await supabase
    .from('cart_items')
    .select('id, product_id, quantity')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (cartError) {
    throw cartError;
  }
  if (!rows?.length) return [];

  const productIds = rows.map((row) => row.product_id);
  const { data: products, error: productError } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds);

  if (productError) {
    throw productError;
  }

  const productsById = new Map((products ?? []).map((product) => [String(product.id), product as CartProduct]));
  return rows.flatMap((row) => {
    const product = productsById.get(String(row.product_id));
    return product ? [{ ...row, product } as SharedCartItem] : [];
  });
}

export async function addProductToSharedCart(userId: string, productId: string | number) {
  const { data: existing, error: findError } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: existing.quantity + 1, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('cart_items').insert({
    user_id: userId,
    product_id: productId,
    quantity: 1,
  });
  if (error) throw error;
}

export async function setSharedCartQuantity(userId: string, cartItemId: string, quantity: number) {
  const { error } = await supabase
    .from('cart_items')
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq('id', cartItemId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeSharedCartItem(userId: string, cartItemId: string) {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', cartItemId)
    .eq('user_id', userId);
  if (error) throw error;
}
