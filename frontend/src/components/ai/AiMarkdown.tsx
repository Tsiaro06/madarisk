import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { Components } from 'react-markdown';

/**
 * Styles appliqués aux éléments générés depuis le Markdown de l'assistant.
 * Mise en forme volontairement compacte : la bulle de chat est étroite
 * (≈ 380 px), les titres restent donc modestes et les tableaux défilent
 * horizontalement plutôt que de casser la mise en page.
 */
const components: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-brand underline underline-offset-2 hover:text-brand-deep"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-base font-bold first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-bold first:mt-0">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-2.5 mb-1 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  h4: ({ children }) => (
    <h5 className="mt-2 mb-1 text-xs font-semibold first:mt-0">{children}</h5>
  ),
  h5: ({ children }) => (
    <h6 className="mt-2 mb-1 text-xs font-semibold first:mt-0">{children}</h6>
  ),
  h6: ({ children }) => (
    <h6 className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wide first:mt-0">
      {children}
    </h6>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-brand/40 pl-3 italic text-ink/70">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2.5 border-line" />,
  // Le `className` porte le langage (`language-python`) des blocs délimités ;
  // sans lui, c'est du code en ligne. `rehype-sanitize` peut retirer ces
  // classes, auquel cas le bloc reste lisible (fond du `pre`).
  code: ({ className, children }) =>
    /language-/.test(className ?? '') ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-1.5 overflow-x-auto rounded-lg bg-gray-100 p-2 text-xs">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-line px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-line px-2 py-1">{children}</td>,
};

/**
 * Rendu Markdown des réponses de l'assistant.
 *
 * - `remarkGfm` active le Markdown enrichi (tableaux, listes de tâches,
 *   texte barré) : utile pour les données tabulaires (alertes, communes…).
 * - `rehypeSanitize` applique un schéma de sanitisation au HTML produit, en
 *   défense en profondeur : react-markdown échappe déjà le HTML brut par
 *   défaut, la sanitize garantit en plus que seuls des protocoles sûrs
 *   (http, https, mailto) passent dans les liens.
 *
 * Le texte saisi par l'utilisateur n'y passe jamais : on l'affiche tel quel.
 */
export function AiMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
