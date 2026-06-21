// Shown by the Shopify-fed tabs (Dashboard / Money / Pipeline) when the store
// isn't connected yet, or when a live Admin API call fails. Server component —
// no secrets here. Keeps those tabs from crashing before Shopify is wired.
export default function ShopifyConnect({ title, cap, error }: { title: string; cap: string; error?: string }) {
  return (
    <>
      <h1 className="ph">{title}</h1>
      <p className="cap">{cap}</p>
      <div className="banner">
        {error ? (
          <>⚠️ {error}</>
        ) : (
          <>
            🛍️ Shopify isn&apos;t connected yet. Open the <a href="/shopify">Shopify tab</a> to finish
            setup (add your <code>SHOPIFY_*</code> env vars), and this tab fills in automatically.
          </>
        )}
      </div>
    </>
  )
}
