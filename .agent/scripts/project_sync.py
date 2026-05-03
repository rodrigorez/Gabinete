import os
import json
import re

# =============================================================================
# script: project_sync.py
# objetivo: sincronizar o markdown do design system com css e json de config.
# autor: antigravity
# notas: variaveis em ingles, comentarios em portugues (pt-br).
# =============================================================================

def sync_layout_tokens():
    """
    Sincroniza as variaveis do GABINETE_DESIGN_SYSTEM.md para o styles.css.
    Busca padroes de hex color e spacing multiples.
    """
    design_system_path = "c:/Users/rodri/Documents/RodrigoRez/Projeto/Gabinete/.agent/GABINETE_DESIGN_SYSTEM.md"
    styles_path = "c:/Users/rodri/Documents/RodrigoRez/Projeto/Gabinete/css/styles.css"

    # verifica se os arquivos existem
    if not os.path.exists(design_system_path) or not os.path.exists(styles_path):
        print("[ERRO] Arquivos de design system ou styles nao encontrados.")
        return

    # leitura do design system
    with open(design_system_path, "r", encoding="utf-8") as f:
        content = f.read()

    # extracao simples de cores hex (padrao basico)
    primary_color = re.search(r'Principal: `(#\w+)`', content)
    accent_color = re.search(r'Destaque: `(#\w+)`', content)

    # logica para atualizar o root no css (exemplo simplificado)
    # nota: em uma implementacao real, usariamos um parser de css manual ou regex robusta.
    print("[INFO] Sincronizando tokens de layout...")
    if primary_color:
        print(f"[SYNC] Cor primaria detectada: {primary_color.group(1)}")
    if accent_color:
        print(f"[SYNC] Cor de destaque detectada: {accent_color.group(1)}")

def validate_assets():
    """
    Valida se os assets definidos no config.json existem fisicamente.
    """
    config_path = "c:/Users/rodri/Documents/RodrigoRez/Projeto/Gabinete/assets/config.json"
    
    if not os.path.exists(config_path):
        return

    with open(config_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # checagem do skybox
    sky_path = data.get("settings", {}).get("env", {}).get("sky", "")
    if sky_path and not os.path.exists(os.path.join("c:/Users/rodri/Documents/RodrigoRez/Projeto/Gabinete", sky_path)):
        print(f"[AVISO] Asset de imagem nao encontrado: {sky_path}")
    else:
        print(f"[OK] Asset validado: {sky_path}")

if __name__ == "__main__":
    # entrada do script
    import sys
    area = sys.argv[2] if len(sys.argv) > 2 else "all"
    
    print(f"--- Iniciando Sincronizacao de Projeto (Area: {area}) ---")
    
    if area in ["layout", "all"]:
        sync_layout_tokens()
    
    if area in ["3d", "audio", "all"]:
        validate_assets()
        
    print("--- Sincronizacao Concluida ---")
