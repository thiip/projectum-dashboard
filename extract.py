from html.parser import HTMLParser
import json

class MyHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_tbody = False
        self.in_tr = False
        self.in_td = False
        self.current_data = []
        self.current_row = []
        self.current_table = ""
        self.tables = {}
        
    def handle_starttag(self, tag, attrs):
        if tag == "table":
            for attr in attrs:
                if attr[0] == "id":
                    self.current_table = attr[1]
                    self.tables[self.current_table] = []
        elif tag == "tbody":
            self.in_tbody = True
        elif tag == "tr" and self.in_tbody:
            self.in_tr = True
            self.current_row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True

    def handle_endtag(self, tag):
        if tag == "tbody":
            self.in_tbody = False
        elif tag == "tr" and self.in_tbody:
            self.in_tr = False
            if self.current_row and self.current_table:
                self.tables[self.current_table].append(self.current_row)
        elif tag == "td" and self.in_tr:
            self.in_td = False

    def handle_data(self, data):
        if self.in_td:
            data = data.strip().replace('\xa0', ' ')
            if data:
                self.current_row.append(data)
                
def parse_html_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html_content = f.read()

    parser = MyHTMLParser()
    parser.feed(html_content)
    return parser.tables

def process_data(tables):
    employees = []
    
    # helper for parsing money
    def parse_money(val):
        if val in ('—', '-'): return 0
        v = val.replace('R$', '').replace('.', '').replace(',', '.').strip()
        try:
            return float(v)
        except ValueError:
            return 0
            
    def get_val(row, idx):
        if idx < len(row): return row[idx]
        return "—"
        
    # Jan Just Smile
    # # | Colaborador | Cargo | Sal. Base | Insalub. | H. Extra | INSS | FGTS | Transp. | Adiant. | Total
    for row in tables.get('tbl-jan-js', []):
         if not row or not row[0].startswith('.'): continue
         employees.append({
             "id": row[0],
             "nome": row[1],
             "cargo": row[2],
             "empresa": "Just Smile",
             "mes": "Janeiro",
             "salario_base": parse_money(get_val(row, 3)),
             "insalubridade": parse_money(get_val(row, 4)),
             "hora_extra": parse_money(get_val(row, 5)),
             "inss": parse_money(get_val(row, 6)),
             "fgts": parse_money(get_val(row, 7)),
             "transporte": parse_money(get_val(row, 8)),
             "adiantamento": parse_money(get_val(row, 9)),
             "total": parse_money(get_val(row, 10))
         })

    # Jan LT Decorações
    # # | Colaborador | Cargo | Origem | Sal. Base | Insalub. | INSS | FGTS | Transp. | Total
    for row in tables.get('tbl-jan-lt', []):
          if not row or not row[0].startswith('.'): continue
          employees.append({
             "id": row[0],
             "nome": row[1],
             "cargo": row[2],
             "origem": row[3],
             "empresa": "LT Decorações",
             "mes": "Janeiro",
             "salario_base": parse_money(get_val(row, 4)),
             "insalubridade": parse_money(get_val(row, 5)),
             "hora_extra": 0,
             "inss": parse_money(get_val(row, 6)),
             "fgts": parse_money(get_val(row, 7)),
             "transporte": parse_money(get_val(row, 8)),
             "adiantamento": 0,
             "total": parse_money(get_val(row, 9))
         })
         
    # Fev Just Smile
    # # | Colaborador | Cargo | Sal. Base | Insalub. | H. Extra | INSS | FGTS | Transp. | Adiant. | Total
    for row in tables.get('tbl-fev-js', []):
         if not row or not row[0].startswith('.'): continue
         employees.append({
             "id": row[0],
             "nome": row[1],
             "cargo": row[2],
             "empresa": "Just Smile",
             "mes": "Fevereiro",
             "salario_base": parse_money(get_val(row, 3)),
             "insalubridade": parse_money(get_val(row, 4)),
             "hora_extra": parse_money(get_val(row, 5)),
             "inss": parse_money(get_val(row, 6)),
             "fgts": parse_money(get_val(row, 7)),
             "transporte": parse_money(get_val(row, 8)),
             "adiantamento": parse_money(get_val(row, 9)),
             "total": parse_money(get_val(row, 10))
         })
         
    # Fev LT Decorações
    # # | Colaborador | Cargo | Origem | Sal. Base | Insalub. | INSS | FGTS | Transp. | Total
    for row in tables.get('tbl-fev-lt', []):
         if not row or not row[0].startswith('.'): continue
         employees.append({
             "id": row[0],
             "nome": row[1],
             "cargo": row[2],
             "origem": row[3],
             "empresa": "LT Decorações",
             "mes": "Fevereiro",
             "salario_base": parse_money(get_val(row, 4)),
             "insalubridade": parse_money(get_val(row, 5)),
             "hora_extra": 0,
             "inss": parse_money(get_val(row, 6)),
             "fgts": parse_money(get_val(row, 7)),
             "transporte": parse_money(get_val(row, 8)),
             "adiantamento": 0,
             "total": parse_money(get_val(row, 9))
         })

    return employees

if __name__ == '__main__':
    filepath = '/Users/Thiago/Downloads/Dashboard Folha de Pagamento 2026.html'
    tables = parse_html_file(filepath)
    employees = process_data(tables)
    
    with open('/Users/Thiago/.gemini/antigravity/scratch/ProjectumDashboard/data.js', 'w', encoding='utf-8') as f:
        f.write('const employeesData = ' + json.dumps(employees, ensure_ascii=False, indent=2) + ';')
    print('Data exported successfully to data.js')
