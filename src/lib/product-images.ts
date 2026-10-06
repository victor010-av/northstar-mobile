export function getProductImageUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== 'images.unsplash.com') return imageUrl;

    // Keep the same photo while requesting a smaller, faster image for phones.
    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'max');
    url.searchParams.set('w', '900');
    url.searchParams.set('q', '80');
    return url.toString();
  } catch {
    return imageUrl;
  }
}
