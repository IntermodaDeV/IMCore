import { XStack, YStack } from "tamagui";
import { SkeletonBox } from "./SkeletonList";

function DrawerMenuSkeleton() {
  return (
    <YStack paddingHorizontal={16} gap="$3" marginTop={10}>
      {Array.from({ length: 8 }).map((_, i) => (
        <XStack key={i} alignItems="center" gap="$3">
          {/* icon */}
          <SkeletonBox width={22} height={22} radius={6} />

          {/* text */}
          <SkeletonBox width={180} height={12} />
        </XStack>
      ))}
    </YStack>
  )
}