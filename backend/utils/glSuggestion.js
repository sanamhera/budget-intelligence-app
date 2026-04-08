function suggestGLCode(vendorName = '', description = '') {
  const text = (vendorName + ' ' + description).toLowerCase();

  const rules = [
    {
      glCode: 'E15105',
      keywords: ['internet', 'wifi', 'broadband']
    },
    {
      glCode: 'E15264',
      keywords: ['software', 'subscription', 'license', 'saas', 'cloud']
    },
    {
      glCode: 'E15255',
      keywords: ['computer repair', 'hardware service']
    },
    {
      glCode: 'E15104',
      keywords: ['mobile', 'phone', 'sim']
    },
    {
      glCode: 'E15001',
      keywords: ['flight', 'airlines', 'air ticket']
    },
    {
      glCode: 'E15007',
      keywords: ['taxi', 'uber', 'ola', 'local travel']
    },
    {
      glCode: 'E15553',
      keywords: ['consulting', 'consultancy']
    },
    {
      glCode: 'E15552',
      keywords: ['legal', 'law firm', 'professional fees']
    },
    {
      glCode: 'E15257',
      keywords: ['amc', 'annual maintenance']
    },
    {
      glCode: 'E15215',
      keywords: ['office maintenance']
    },
    {
      glCode: 'E15208',
      keywords: ['xerox', 'printing']
    },
    {
      glCode: 'E16001',
      keywords: ['advertisement', 'advertising']
    },
    {
      glCode: 'E16006',
      keywords: ['publicity', 'marketing material']
    }
  ];

  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (text.includes(keyword)) {
        return rule.glCode;
      }
    }
  }

  return '';
}

module.exports = { suggestGLCode };