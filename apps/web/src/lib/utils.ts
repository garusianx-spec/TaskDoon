import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The app's Persian typography uses named sizes that Tailwind Merge would otherwise
// treat as text colors. Keep color, size, and direction-aware spacing independent.
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'micro',
            'caption',
            'body-sm',
            'body',
            'title-sm',
            'title',
            'heading-sm',
            'heading',
            'display',
          ],
        },
      ],
    },
  },
});

export function cn(...values: ClassValue[]): string {
  return merge(clsx(values));
}
