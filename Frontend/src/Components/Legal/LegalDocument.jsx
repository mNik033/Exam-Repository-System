import ReactMarkdown from 'react-markdown';
import privacyPolicyMd from '../../assets/docs/privacy-policy.md?raw';
import termsOfServiceMd from '../../assets/docs/terms-of-service.md?raw';

export default function LegalDocument({ type }) {
  const content = type === 'privacy' ? privacyPolicyMd : termsOfServiceMd;

  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL;
  const businessAddress = import.meta.env.VITE_BUSINESS_ADDRESS || 'Address not provided';
  const processedContent = content
    .replace(/\{\{SUPPORT_EMAIL\}\}/g, supportEmail)
    .replace(/\{\{BUSINESS_ADDRESS\}\}/g, businessAddress);

  return (
    <div className="page-wrapper with-navbar">
      <div className="page-content">
        <div className="markdown-body">
          <ReactMarkdown>
            {processedContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
