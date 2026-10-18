"""Reference diet-pattern index from saved package labels.

This is not a health or disease assessment. It only summarises the sugar,
sodium and fat clues that are readable on saved labels, plus how complete the
record set is. Thresholds are label-comparison references (GB 28050 low-claim
limits and NHS front-of-pack high limits), not medical limits or intake advice.
"""
from statistics import mean

# GB 28050-2011 low claims (per 100 g) and NHS front-of-pack "high" thresholds.
LOW = {'sugar': 5.0, 'sodium': 120.0, 'fat': 3.0}
HIGH = {'sugar': 22.5, 'sodium': 600.0, 'fat': 17.5}
TITLES = {'sugar': '糖线索', 'sodium': '钠/盐线索', 'fat': '油脂线索'}
UNITS = {'sugar': 'g/100g', 'sodium': 'mg/100g', 'fat': 'g/100g'}
WEIGHTS = {'coverage': 25, 'sugar': 25, 'sodium': 25, 'fat': 25}


def _clip(value):
    return max(0.0, min(1.0, value))


def _score_nutrient(key, values, clue_count=0, record_count=0):
    """Return a 0-100 clue score and the evidence behind it."""
    if not values:
        return None, {'reliable': 0, 'average': None, 'highCount': 0, 'highRatio': None, 'clueCount': clue_count}
    average = mean(values)
    density = _clip((HIGH[key] - average) / (HIGH[key] - LOW[key])) * 100
    high_count = sum(1 for value in values if value > HIGH[key])
    high_ratio = high_count / len(values)
    clue_ratio = (clue_count / record_count) if record_count else 0
    # Ingredient clues are weaker evidence than numeric fields, so the penalty is
    # deliberately small; repeated clues still move a processed-food profile down.
    score = max(0.0, density * 0.6 + (1 - high_ratio) * 100 * 0.4 - 8 * clue_ratio)
    return round(score, 1), {'reliable': len(values), 'average': round(average, 2),
                             'highCount': high_count, 'highRatio': round(high_ratio, 2),
                             'clueCount': clue_count, 'unit': UNITS[key]}


def evaluate(days, record_count, day_count, readable_count, samples, clue_counts=None):
    """Build the index object used by the API and model prompt.

    samples: list of dicts containing reliable per-100g sugar/sodium/fat values.
    clue_counts: optional {'sugar': n, 'salt': n, 'oil': n} ingredient-clue counts.
    """
    clue_counts = clue_counts or {}
    clue_for = {'sugar': 'sugar', 'sodium': 'salt', 'fat': 'oil'}
    values = {key: [sample[key] for sample in samples if isinstance(sample.get(key), (int, float)) and not isinstance(sample.get(key), bool)]
              for key in ('sugar', 'sodium', 'fat')}
    days_ratio = _clip(day_count / days) if days else 0
    readable_ratio = _clip(readable_count / record_count) if record_count else 0
    nutrient_ratio = sum(1 for key in values if values[key]) / 3
    coverage_score = round((0.4 * days_ratio + 0.3 * readable_ratio + 0.3 * nutrient_ratio) * 100, 1)

    dimensions = [{
        'key': 'coverage', 'label': '记录充分度', 'score': coverage_score, 'weight': WEIGHTS['coverage'],
        'note': f'有记录天数占 {round(days_ratio * 100)}%，配料可读占 {round(readable_ratio * 100)}%，糖/钠/脂肪可靠字段覆盖 {round(nutrient_ratio * 100)}%。',
    }]
    for key in ('sugar', 'sodium', 'fat'):
        clue_count = clue_counts.get(clue_for[key], 0)
        score, evidence = _score_nutrient(key, values[key], clue_count, record_count)
        if score is None:
            note = '缺少可靠的每100克数值，本项未计入总分。'
        else:
            note = (f'可靠数值 {evidence["reliable"]} 条，平均 {evidence["average"]}{UNITS[key]}；'
                    f'高于标签高值的 {evidence["highCount"]} 条；配料线索 {clue_count} 条。')
        dimensions.append({'key': key, 'label': TITLES[key], 'score': score, 'weight': WEIGHTS[key],
                           'note': note, 'evidence': evidence})

    available = [item for item in dimensions if item['score'] is not None]
    total_weight = sum(item['weight'] for item in available)
    score = round(sum(item['score'] * item['weight'] for item in available) / total_weight, 1) if total_weight else None
    reliable_nutrients = sum(1 for key in values if values[key])
    min_records = 2 if days <= 3 else 3
    completeness = 0.45 * days_ratio + 0.25 * readable_ratio + 0.30 * nutrient_ratio
    sample_factor = min(1.0, record_count / 6)
    confidence = round(100 * completeness * (0.6 + 0.4 * sample_factor), 0)
    sufficient = (record_count >= min_records and day_count >= 2 and readable_count >= 2
                  and reliable_nutrients >= 1 and confidence >= 35)
    if not sufficient:
        score = None
        level, label = 'insufficient', '数据不足，暂不评分'
    elif score >= 80:
        level, label = 'good', '标签线索较平稳'
    elif score >= 65:
        level, label = 'fair', '有可关注项'
    elif score >= 50:
        level, label = 'watch', '多项需要留意'
    else:
        level, label = 'attention', '糖、盐或油线索偏多'

    return {
        'score': score,
        'level': level,
        'label': label,
        'confidence': int(confidence),
        'sufficient': sufficient,
        'dimensions': dimensions,
        'basis': {'days': days, 'records': record_count, 'daysWithRecords': day_count,
                  'readable': readable_count, 'reliableNutrients': reliable_nutrients},
        'notes': [
            '评分只基于已保存包装标签的每100克糖、钠和脂肪线索，不代表实际摄入量或健康状况。',
            '未包含蔬果、全谷、蛋白质来源、份量和实际食用确认，不能代表整体膳食质量。',
            '低值/高值参考 GB 28050 营养声称与 NHS 正面标签分级，仅用于标签比较，不是医学限值。',
            '没有记录的天数不参与评分；配料可读性和可靠字段会降低参考度。',
        ],
    }
