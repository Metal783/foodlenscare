module.exports = async function selectBirthday(page, id, value) {
  await page.locator('#' + id).click();
  const dialog = page.getByRole('dialog', { name: '选择出生日期', exact: true });
  await dialog.waitFor();
  if (!value) return dialog.getByRole('button', { name: '清除日期', exact: true }).click();
  const [year, month, day] = value.split('-').map(Number);
  for (const [label, value] of [['年', year], ['月', month], ['日', day]]) {
    await dialog.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: value + label, exact: true }).click();
  }
  await dialog.getByRole('button', { name: '确定', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
};
