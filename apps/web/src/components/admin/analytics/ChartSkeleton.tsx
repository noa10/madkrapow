import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/Skeleton";

/** Placeholder that reserves a chart card's footprint while its chunk loads. */
export function ChartSkeleton({ chartHeight = 300 }: { chartHeight?: number }) {
  return (
    <Card className="bg-card border-border shadow-sm rounded-xl">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full" style={{ height: chartHeight }} />
      </CardContent>
    </Card>
  );
}
