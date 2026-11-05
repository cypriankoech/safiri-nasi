import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";
import { fmtDate } from "@/lib/format";
import { getBlogPost, NotFoundError } from "@/lib/server-api";
import type { BlogPost } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = await getBlogPost(slug);
    return { title: post.title, description: post.excerpt ?? undefined, openGraph: { images: post.cover_image ? [post.cover_image] : [] } };
  } catch {
    return { title: "Post" };
  }
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  let post: BlogPost;
  try {
    post = await getBlogPost(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  return (
    <article>
      <Container className="max-w-3xl pt-10">
        <Link href="/blog" className="text-sm text-muted hover:text-text">← All stories</Link>
        <p className="mt-4 text-sm text-muted">{fmtDate(post.published_at)} · {post.author_name}</p>
        <h1 className="mt-1 text-4xl font-extrabold text-primary md:text-5xl">{post.title}</h1>
        {post.excerpt && <p className="mt-4 text-lg text-muted">{post.excerpt}</p>}
      </Container>
      {post.cover_image && (
        <Container className="mt-8 max-w-5xl">
          <div className="relative aspect-[16/8] overflow-hidden rounded-[2rem]">
            <Image src={post.cover_image} alt="" fill preload sizes="(min-width: 1024px) 1024px, 100vw" className="object-cover" />
          </div>
        </Container>
      )}
      <Container className="prose-safiri mt-10 max-w-3xl">
        <ReactMarkdown>{post.body}</ReactMarkdown>
      </Container>
      <Container className="mt-12 max-w-3xl">
        <div className="rounded-3xl bg-lime/15 p-6">
          <p className="text-lg font-bold">Ready to go?</p>
          <p className="text-muted">Browse our trips and book with a deposit by M-Pesa.</p>
          <ButtonLink href="/tours" className="mt-4">See trips</ButtonLink>
        </div>
      </Container>
    </article>
  );
}
