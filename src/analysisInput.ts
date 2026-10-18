/** Only label evidence needed by the service; never send images or raw OCR. */
export function analysisInput(label: any) {
  return {
    productName: label?.productName || '', ingredientText: label?.ingredientText || '', allergenDeclaration: label?.allergenDeclaration || '',
    nutritionPer100g: label?.nutritionPer100g, nutritionPerServing: label?.nutritionPerServing,
    declaredPer: label?.declaredPer, servingLabel: label?.servingLabel, servingUnit: label?.servingUnit,
    nutritionEvidence: Object.fromEntries(['energy', 'protein', 'fat', 'saturatedFat', 'carbohydrate', 'sugar', 'sodium'].map(key => [key, {
      confidence: label?.nutritionCandidates?.[key]?.confidence ?? label?.confidence?.[key],
      conflict: !!label?.nutritionCandidates?.[key]?.conflict, warning: !!label?.nutritionCandidates?.[key]?.warning,
    }])),
  };
}
