"""从 WHO 标准 Excel（xlsx）提取每月 (-2SD, -1SD, median, +1SD, +2SD) 值。
xlsx 是 zip+xml，用 zipfile + xml.etree 解析，避免依赖 openpyxl。
"""
import zipfile
import xml.etree.ElementTree as ET
import re
from pathlib import Path

NS = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def load_shared_strings(zf):
    """解析 sharedStrings.xml，返回字符串列表。"""
    try:
        with zf.open('xl/sharedStrings.xml') as f:
            tree = ET.parse(f)
    except KeyError:
        return []
    strings = []
    for si in tree.getroot().findall('main:si', NS):
        # 拼接所有 <t> 文本（可能分散在 <r> 里）
        text_parts = [t.text or '' for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')]
        strings.append(''.join(text_parts))
    return strings


def col_letter_to_index(letter):
    """A->0, B->1, ..., Z->25, AA->26, ..."""
    n = 0
    for ch in letter:
        n = n * 26 + (ord(ch.upper()) - ord('A') + 1)
    return n - 1


def cell_ref_to_indices(ref):
    """'B5' -> (col=1, row=4)。"""
    m = re.match(r'^([A-Z]+)(\d+)$', ref)
    return col_letter_to_index(m.group(1)), int(m.group(2)) - 1


def parse_sheet_rows(zf, sheet_path='xl/worksheets/sheet1.xml'):
    """返回 [[(col_index, value_or_str, is_str)] ...] 每行。"""
    with zf.open(sheet_path) as f:
        tree = ET.parse(f)
    sheet_data = tree.getroot().find('main:sheetData', NS)
    rows = []
    for row in sheet_data.findall('main:row', NS):
        row_cells = []
        for c in row.findall('main:c', NS):
            ref = c.get('r')
            t = c.get('t', 'n')
            v = c.find('main:v', NS)
            val = v.text if v is not None else None
            if t == 's':
                # shared string index
                row_cells.append((cell_ref_to_indices(ref)[0], val, True))
            elif t == 'inlineStr':
                is_el = c.find('main:is', NS)
                txt = ''.join((tt.text or '') for tt in is_el.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')) if is_el is not None else ''
                row_cells.append((cell_ref_to_indices(ref)[0], txt, True))
            else:
                # number
                row_cells.append((cell_ref_to_indices(ref)[0], val, False))
        rows.append(row_cells)
    return rows


def extract_zscore_rows(xlsx_path, sd_columns):
    """sd_columns: dict mapping column index -> header label we want to match.
    返回 [(month, {sd_label: value}), ...]
    """
    with zipfile.ZipFile(xlsx_path) as zf:
        strings = load_shared_strings(zf)
        rows = parse_sheet_rows(zf)
    # 找到表头行：包含 "Month" 和 "SD" 等
    header_row = None
    for i, r in enumerate(rows):
        texts = [strings[int(v)] if is_str and v is not None else (v or '') for _, v, is_str in r]
        if any('Month' in t for t in texts):
            header_row = i
            break
    if header_row is None:
        raise RuntimeError(f'No header row in {xlsx_path}')
    header = rows[header_row]
    # 构建 col_index -> label
    col_to_label = {}
    for col_idx, v, is_str in header:
        if is_str and v is not None:
            col_to_label[col_idx] = strings[int(v)]
        elif v is not None:
            col_to_label[col_idx] = v
    # WHO 表头：Month, L, M, S, SD3neg, SD2neg, SD1neg, SD0, SD1, SD2, SD3
    # 按精确字符串匹配，避免 'M' 误命中 median
    label_to_target = {}
    for col_idx, label in col_to_label.items():
        l = label.strip()
        if l in ('SD3neg', 'SD-3', 'SD-3neg'):
            label_to_target[col_idx] = 'minus3sd'
        elif l in ('SD2neg', 'SD-2', 'SD-2neg'):
            label_to_target[col_idx] = 'minus2sd'
        elif l in ('SD1neg', 'SD-1', 'SD-1neg'):
            label_to_target[col_idx] = 'minus1sd'
        elif l in ('SD0', 'Median', 'P50'):
            label_to_target[col_idx] = 'median'
        elif l in ('SD1', 'SD+1'):
            label_to_target[col_idx] = 'plus1sd'
        elif l in ('SD2', 'SD+2'):
            label_to_target[col_idx] = 'plus2sd'
        elif l in ('SD3', 'SD+3'):
            label_to_target[col_idx] = 'plus3sd'

    # 也打印所有 header 便于调试
    print(f'  headers: {col_to_label}')
    print(f'  matched: {label_to_target}')

    # 数据行
    results = []
    for r in rows[header_row + 1:]:
        row_map = {}
        for col_idx, v, is_str in r:
            if v is None:
                continue
            if is_str:
                row_map[col_idx] = strings[int(v)]
            else:
                try:
                    row_map[col_idx] = float(v)
                except ValueError:
                    row_map[col_idx] = v
        # Month 列
        month_val = None
        for col_idx, v in row_map.items():
            label = col_to_label.get(col_idx, '')
            if label.strip().lower() == 'month':
                month_val = v
                break
        if month_val is None:
            continue
        try:
            month = int(float(month_val))
        except (ValueError, TypeError):
            continue
        if month < 0:
            continue
        entry = {'month': month}
        for col_idx, target in label_to_target.items():
            if col_idx in row_map and isinstance(row_map[col_idx], (int, float)):
                entry[target] = row_map[col_idx]
        # 只保留我们关心的5个字段都齐全的
        if all(k in entry for k in ['minus2sd', 'minus1sd', 'median', 'plus1sd', 'plus2sd']):
            results.append(entry)
    return results


def main():
    files = {
        'WHO_BOYS_WEIGHT': 'wfa-boys.xlsx',
        'WHO_GIRLS_WEIGHT': 'wfa-girls.xlsx',
        'WHO_BOYS_LENGTH': 'lfa-boys-0-2.xlsx',
        'WHO_GIRLS_LENGTH': 'lfa-girls-0-2.xlsx',
        'WHO_BOYS_HEIGHT': 'hfa-boys-2-5.xlsx',
        'WHO_GIRLS_HEIGHT': 'hfa-girls-2-5.xlsx',
    }
    base = Path('scripts/who-data')
    all_data = {}
    for name, fn in files.items():
        print(f'\n=== {name} ({fn}) ===')
        rows = extract_zscore_rows(base / fn, None)
        print(f'  rows: {len(rows)}, first: {rows[0] if rows else None}, last: {rows[-1] if rows else None}')
        all_data[name] = rows
    # 输出 TypeScript 友好的格式
    print('\n\n========= TYPESCRIPT DATA =========')
    for name, rows in all_data.items():
        print(f'\n// {name} ({len(rows)} months)')
        for r in rows:
            print(f'  [{r["month"]}, {r["minus2sd"]}, {r["minus1sd"]}, {r["median"]}, {r["plus1sd"]}, {r["plus2sd"]}],')


if __name__ == '__main__':
    main()