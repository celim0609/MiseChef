import type { LinkedRecipeComponent } from '../../../types';

export const scaleLinkedRecipeQuantities = (components: LinkedRecipeComponent[] | undefined, ratio: number) =>
  components?.map(component => ({ ...component, quantity: Number((component.quantity * ratio).toFixed(6)) }));
