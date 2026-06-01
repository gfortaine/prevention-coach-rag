import { GuideViewer } from "@/components/GuideViewer";

interface GuidePageProps {
  params: Promise<{
    domain: string;
  }>;
  searchParams?: Promise<{
    page?: string | string[];
  }>;
}

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawValue ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

export default async function GuidePage({ params, searchParams }: GuidePageProps) {
  const { domain } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return <GuideViewer domain={domain} initialPage={parsePage(resolvedSearchParams?.page)} />;
}
