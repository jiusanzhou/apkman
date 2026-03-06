use wasm_bindgen::prelude::*;
use dex_decompiler::{parse_dex, Decompiler};

/// Decompile an entire DEX file to Java source.
/// Returns the full decompiled Java source as a single string.
#[wasm_bindgen]
pub fn decompile_dex(data: &[u8]) -> std::result::Result<String, JsValue> {
    let dex = parse_dex(data).map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;
    let decompiler = Decompiler::new(&dex);
    let result = decompiler.decompile().map_err(|e| JsValue::from_str(&format!("Decompile error: {e}")))?;
    Ok(result)
}

/// Decompile a single class by name from a DEX file.
/// class_name should be in Dalvik format like "Lcom/example/MyClass;"
#[wasm_bindgen]
pub fn decompile_class(data: &[u8], class_name: &str) -> std::result::Result<String, JsValue> {
    let dex = parse_dex(data).map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;
    let decompiler = Decompiler::new(&dex);

    for class_def in dex.class_defs() {
        let class_def = class_def.map_err(|e| JsValue::from_str(&format!("Class parse error: {e}")))?;
        let ctype = dex.get_type(class_def.class_idx).map_err(|e| JsValue::from_str(&format!("Type error: {e}")))?;
        if ctype == class_name {
            let java = decompiler.decompile_class(&class_def).map_err(|e| JsValue::from_str(&format!("Decompile error: {e}")))?;
            return Ok(java);
        }
    }

    Err(JsValue::from_str(&format!("Class not found: {class_name}")))
}

/// List all class names in a DEX file.
/// Returns JSON array of class names.
#[wasm_bindgen]
pub fn list_classes(data: &[u8]) -> std::result::Result<String, JsValue> {
    let dex = parse_dex(data).map_err(|e| JsValue::from_str(&format!("Parse error: {e}")))?;
    let mut names = Vec::new();
    for class_def in dex.class_defs() {
        let class_def = class_def.map_err(|e| JsValue::from_str(&format!("Class parse error: {e}")))?;
        let ctype = dex.get_type(class_def.class_idx).map_err(|e| JsValue::from_str(&format!("Type error: {e}")))?;
        names.push(ctype.to_string());
    }
    Ok(serde_json::to_string(&names).unwrap_or_else(|_| "[]".to_string()))
}
