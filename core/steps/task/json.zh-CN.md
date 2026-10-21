只返回 JSON，不要使用 Markdown code fence。
格式必须符合：{"summary":"...","detail":"...","suggestions":[{"title":"...","task":"...","contribution":"...","parentTitle":""}],"visualReferences":[{"title":"...","imageUrl":"https://...","sourceUrl":"https://...","description":"...","palette":["navy","white"],"formula":"..."}]}。
若没有视觉参考，visualReferences 返回空数组。
